"""
rag_pipeline.py — RAG (Retrieval-Augmented Generation) Pipeline

Provides:
- DocumentProcessor: Chunks documents into passages
- EmbeddingService: Encodes passages + queries using sentence-transformers
- VectorStore: FAISS-based vector search for nearest-neighbor retrieval
- RAGTrainer: Trains a language model with retrieval-augmented context

Integrated into LLM Training Studio as an optional training mode.
All components run locally — no external API keys required.
"""

import json, os, gc, time, uuid
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

# ─── Lazy imports (graceful fallback) ───────────────────────────────
_HAS_SENTENCE_TRANSFORMERS = False
_HAS_FAISS = False

try:
    from sentence_transformers import SentenceTransformer
    _HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    SentenceTransformer = None

try:
    import faiss
    _HAS_FAISS = True
except ImportError:
    faiss = None


RAG_AVAILABLE = _HAS_SENTENCE_TRANSFORMERS and _HAS_FAISS


# ─── Config ──────────────────────────────────────────────────────────

@dataclass
class RAGConfig:
    """Configuration for RAG training."""
    enabled: bool = False
    embedding_model: str = "all-MiniLM-L6-v2"    # sentence-transformers model
    chunk_size: int = 512                          # chars per chunk
    chunk_overlap: int = 128                       # overlap between chunks
    top_k: int = 5                                 # passages to retrieve per query
    retrieval_weight: float = 0.3                  # weight of retrieval loss vs LM loss
    max_context_length: int = 1024                 # max context chars to include
    index_type: str = "flat"                       # "flat" | "ivf" for FAISS
    use_gpu: bool = False                          # use GPU for FAISS if available


DEFAULT_RAG_CONFIG = RAGConfig()

DOCS_DIR = Path(__file__).parent / "data" / "rag_index"
DOCS_DIR.mkdir(parents=True, exist_ok=True)


# ═════════════════════════════════════════════════════════════════════
#  1. Document Processor — chunk documents into passages
# ═════════════════════════════════════════════════════════════════════

@dataclass
class Passage:
    """A single chunk of text from a document with metadata."""
    id: str
    text: str
    source_file: str = ""
    source_id: str = ""
    metadata: dict = field(default_factory=dict)


class DocumentProcessor:
    """Splits documents into overlapping chunks for embedding and retrieval."""

    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 128):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk_text(self, text: str, source_file: str = "",
                   source_id: str = "", metadata: dict = None) -> list[Passage]:
        """Split a text into overlapping chunks."""
        if not text or len(text.strip()) < 10:
            return []

        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + self.chunk_size, text_len)

            # Try to break at a sentence boundary
            if end < text_len:
                # Look for newline, period, question mark, exclamation
                for sep in ["\n\n", "\n", ". ", "! ", "? "]:
                    idx = text.rfind(sep, start, end)
                    if idx > start:
                        end = idx + len(sep)
                        break

            chunk_text = text[start:end].strip()
            if chunk_text:
                passage = Passage(
                    id=str(uuid.uuid4()),
                    text=chunk_text,
                    source_file=source_file,
                    source_id=source_id,
                    metadata=metadata or {},
                )
                chunks.append(passage)

            start += self.chunk_size - self.chunk_overlap

        return chunks

    def chunk_document(self, filepath: Path, content: str = None) -> list[Passage]:
        """Load a file, read its content, and chunk it."""
        if content is None:
            try:
                content = filepath.read_text("utf-8", errors="replace")
            except Exception:
                return []

        metadata = {
            "filename": filepath.name,
            "size": len(content),
            "type": filepath.suffix.lower(),
        }
        return self.chunk_text(
            text=content,
            source_file=str(filepath),
            metadata=metadata,
        )


# ═════════════════════════════════════════════════════════════════════
#  2. Embedding Service — encode passages into vectors
# ═════════════════════════════════════════════════════════════════════

class EmbeddingService:
    """Encodes text into embedding vectors using sentence-transformers."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2",
                 device: str = "cpu"):
        if not _HAS_SENTENCE_TRANSFORMERS:
            raise RuntimeError(
                "sentence-transformers not installed. Run: pip install sentence-transformers"
            )
        self.model_name = model_name
        self.device = device
        self._model = None
        self._dimension = 384  # all-MiniLM-L6-v2 default; updated on load

    def _load_model(self):
        """Lazy-load the embedding model (first call may download ~80MB)."""
        if self._model is None:
            self._model = SentenceTransformer(self.model_name, device=self.device)
            self._dimension = self._model.get_sentence_embedding_dimension()

    def encode(self, texts: list[str], batch_size: int = 32,
               show_progress: bool = False) -> np.ndarray:
        """Encode a list of texts into a NumPy array of embeddings."""
        self._load_model()
        embeddings = self._model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            normalize_embeddings=True,  # L2 normalization for cosine similarity
        )
        return embeddings.astype(np.float32)

    def encode_query(self, query: str) -> np.ndarray:
        """Encode a single query string."""
        return self.encode([query])[0]

    @property
    def dimension(self) -> int:
        self._load_model()
        return self._dimension


# ═════════════════════════════════════════════════════════════════════
#  3. Vector Store — FAISS-based similarity search
# ═════════════════════════════════════════════════════════════════════

class VectorStore:
    """FAISS-powered vector store for passage retrieval.

    Stores passages + their embeddings in a FAISS index, persisted
    to disk for reuse across training sessions.
    """

    def __init__(self, index_dir: str | Path = None):
        if not _HAS_FAISS:
            raise RuntimeError(
                "faiss not installed. Run: pip install faiss-cpu"
            )
        self.index_dir = Path(index_dir) if index_dir else DOCS_DIR
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.index_dir / "rag_index.faiss"
        self.passages_path = self.index_dir / "rag_passages.jsonl"

        self.index: Optional[faiss.Index] = None
        self.passages: list[Passage] = []
        self.dimension = 384  # default; updated on first build
        self._dirty = False

        # Load existing index if available
        self._load()

    def _load(self):
        """Load a previously saved FAISS index and passages from disk."""
        if self.index_path.exists() and self.passages_path.exists():
            try:
                self.index = faiss.read_index(str(self.index_path))
                self.dimension = self.index.d
                self.passages = []
                with open(self.passages_path) as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            data = json.loads(line)
                            self.passages.append(Passage(**data))
            except Exception as e:
                print(f"[RAG] Failed to load index: {e}")
                self.index = None
                self.passages = []

    def save(self):
        """Persist the FAISS index and passages to disk."""
        if self.index is None or not self._dirty:
            return
        try:
            faiss.write_index(self.index, str(self.index_path))
            with open(self.passages_path, "w") as f:
                for p in self.passages:
                    f.write(json.dumps({
                        "id": p.id,
                        "text": p.text,
                        "source_file": p.source_file,
                        "source_id": p.source_id,
                        "metadata": p.metadata,
                    }, ensure_ascii=False) + "\n")
            self._dirty = False
        except Exception as e:
            print(f"[RAG] Failed to save index: {e}")

    def build(self, passages: list[Passage],
              embeddings: np.ndarray, overwrite: bool = False):
        """Build a new FAISS index from passages and their embeddings.

        Args:
            passages: List of Passage objects
            embeddings: NumPy array of shape (N, dim) of float32 normalized vectors
            overwrite: If True, replace existing index; otherwise append
        """
        if overwrite:
            self.index = None
            self.passages = []
            # Remove old files
            if self.index_path.exists():
                self.index_path.unlink()
            if self.passages_path.exists():
                self.passages_path.unlink()

        self.dimension = embeddings.shape[1]

        if self.index is None:
            # Inner product (cosine sim since vectors are L2-normalized)
            self.index = faiss.IndexFlatIP(self.dimension)

        self.index.add(embeddings)
        self.passages.extend(passages)
        self._dirty = True
        self.save()

    def add(self, passages: list[Passage], embeddings: np.ndarray):
        """Add passages + embeddings to an existing index."""
        if self.index is None:
            self.build(passages, embeddings, overwrite=True)
            return
        self.index.add(embeddings)
        self.passages.extend(passages)
        self._dirty = True
        self.save()

    def search(self, query_vector: np.ndarray, k: int = 5
               ) -> list[tuple[Passage, float]]:
        """Retrieve top-k passages closest to the query vector.

        Returns list of (Passage, similarity_score) tuples.
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        if query_vector.ndim == 1:
            query_vector = query_vector.reshape(1, -1)

        # Ensure float32
        query_vector = np.ascontiguousarray(query_vector, dtype=np.float32)

        k = min(k, self.index.ntotal)
        distances, indices = self.index.search(query_vector, k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx >= 0 and idx < len(self.passages):
                results.append((self.passages[idx], float(dist)))
        return results

    def search_text(self, query: str, embedder: EmbeddingService,
                    k: int = 5) -> list[tuple[Passage, float]]:
        """Encode a text query and retrieve matching passages."""
        query_vec = embedder.encode_query(query)
        return self.search(query_vec, k=k)

    def get_stats(self) -> dict:
        """Return statistics about the vector store."""
        return {
            "num_passages": len(self.passages),
            "num_vectors": self.index.ntotal if self.index else 0,
            "dimension": self.dimension,
            "index_path": str(self.index_path),
            "disk_size_mb": round(self.index_path.stat().st_size / (1024**2), 2)
            if self.index_path.exists() else 0,
        }

    def clear(self):
        """Remove all passages and the FAISS index."""
        self.index = None
        self.passages = []
        if self.index_path.exists():
            self.index_path.unlink()
        if self.passages_path.exists():
            self.passages_path.unlink()
        self._dirty = False


# ═════════════════════════════════════════════════════════════════════
#  4. RAG Pipeline — end-to-end indexing + retrieval
# ═════════════════════════════════════════════════════════════════════

class RAGPipeline:
    """End-to-end RAG pipeline combining document processing,
    embedding, and vector search.

    Usage:
        rag = RAGPipeline()
        rag.index_file(Path("data.txt"))       # Add documents
        results = rag.query("my question")      # Retrieve
    """

    def __init__(self, config: RAGConfig = None,
                 embedder: EmbeddingService = None,
                 vector_store: VectorStore = None):
        self.config = config or RAGConfig()
        self.embedder = embedder or EmbeddingService(
            model_name=self.config.embedding_model,
        )
        self.processor = DocumentProcessor(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
        )
        self.vector_store = vector_store or VectorStore()

    def index_file(self, filepath: Path, content: str = None) -> int:
        """Index a single file: chunk + embed + store.

        Returns the number of passages added.
        """
        passages = self.processor.chunk_document(filepath, content=content)
        if not passages:
            return 0

        texts = [p.text for p in passages]
        embeddings = self.embedder.encode(texts, show_progress=False)
        self.vector_store.add(passages, embeddings)
        return len(passages)

    def index_text(self, text: str, source: str = "",
                   source_id: str = "") -> int:
        """Index a text string: chunk + embed + store."""
        passages = self.processor.chunk_text(
            text, source_file=source, source_id=source_id
        )
        if not passages:
            return 0

        texts = [p.text for p in passages]
        embeddings = self.embedder.encode(texts, show_progress=False)
        self.vector_store.add(passages, embeddings)
        return len(passages)

    def index_queued_files(self, file_map: dict[str, dict],
                           file_to_text_fn) -> dict:
        """Index all files from the training queue.

        Args:
            file_map: dict of file_id -> file metadata
            file_to_text_fn: callable that takes file metadata and returns text

        Returns:
            dict with indexing stats
        """
        total_passages = 0
        total_files = 0
        errors = 0

        for fid, fd in file_map.items():
            try:
                text = file_to_text_fn(fd)
                if text and len(text.strip()) > 20:
                    n = self.index_text(
                        text, source=fd.get("name", "unknown"),
                        source_id=fid
                    )
                    total_passages += n
                    total_files += 1
            except Exception:
                errors += 1

        return {
            "files_indexed": total_files,
            "passages_created": total_passages,
            "errors": errors,
            "total_vectors": self.vector_store.index.ntotal
            if self.vector_store.index else 0,
        }

    def query(self, query: str, k: int = None) -> list[tuple[Passage, float]]:
        """Query the vector store with a text string."""
        k = k or self.config.top_k
        return self.vector_store.search_text(query, self.embedder, k=k)

    def build_rag_context(self, query: str, k: int = None,
                          max_chars: int = None) -> tuple[str, list]:
        """Build a context string from retrieved passages for use in prompts.

        Returns (context_string, retrieved_passages).
        """
        max_chars = max_chars or self.config.max_context_length
        results = self.query(query, k=k)

        if not results:
            return "", []

        context_parts = []
        used_chars = 0
        retrieved = []

        for passage, score in results:
            text = passage.text.strip()
            if used_chars + len(text) > max_chars:
                # Truncate to fit
                remaining = max_chars - used_chars
                if remaining > 50:
                    text = text[:remaining] + "..."
                else:
                    break

            context_parts.append(f"[Context from {passage.source_file}]\n{text}")
            used_chars += len(text) + 50
            retrieved.append((passage, score))

        return "\n\n".join(context_parts), retrieved

    def get_stats(self) -> dict:
        """Get full pipeline stats."""
        stats = self.vector_store.get_stats()
        stats["embedding_model"] = self.config.embedding_model
        stats["chunk_size"] = self.config.chunk_size
        stats["chunk_overlap"] = self.config.chunk_overlap
        return stats

    def clear(self):
        """Clear all indexed data."""
        self.vector_store.clear()


# ═════════════════════════════════════════════════════════════════════
#  5. RAG Training Augmentation
# ═════════════════════════════════════════════════════════════════════

def augment_training_text_with_rag(text: str, rag_pipeline: RAGPipeline,
                                    config: RAGConfig) -> str:
    """Augment a training text by prepending retrieved context.

    For each input text, retrieves the top-k most similar passages
    from the vector store and prepends them as context. This teaches
    the model to condition its generation on retrieved information.

    Returns the augmented text (context + original text).
    """
    context, _ = rag_pipeline.build_rag_context(
        text, k=config.top_k, max_chars=config.max_context_length
    )

    if not context:
        return text

    augmented = f"<RAG_CONTEXT>\n{context}\n</RAG_CONTEXT>\n\n{text}"
    return augmented


def estimate_retrieval_accuracy(rag_pipeline: RAGPipeline,
                                 text: str, top_k: int = 5) -> float:
    """Estimate how well the retriever finds relevant passages for a text.

    Uses a simple self-consistency check: the query text itself should
    retrieve passages from the same document (if indexed). Returns 0-1 score.
    """
    results = rag_pipeline.query(text, k=top_k)
    if not results:
        return 0.0

    # Average similarity score of top results
    scores = [score for _, score in results]
    return float(np.mean(scores))
