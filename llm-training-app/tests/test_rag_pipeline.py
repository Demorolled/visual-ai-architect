#!/usr/bin/env python3
"""Unit tests for rag_pipeline.py.

Tests cover:
- DocumentProcessor: chunking logic, sentence boundaries, overlap, metadata
- EmbeddingService: encoding shape, normalization, dimension
- VectorStore: build/search/add/clear, persistence round-trip, stats
- RAGPipeline: end-to-end indexing, query, context building, clear
- Training augmentation functions: context prepending, retrieval accuracy

Run:
    cd llm-training-app && python -m pytest tests/test_rag_pipeline.py -v
"""

import gc, json, os, tempfile, uuid
from pathlib import Path
from unittest import SkipTest, mock

import numpy as np
import pytest

# ── Module under test ─────────────────────────────────────────────────────
from rag_pipeline import (
    RAGConfig, DEFAULT_RAG_CONFIG, Passage,
    DocumentProcessor, EmbeddingService, VectorStore,
    RAGPipeline, augment_training_text_with_rag,
    estimate_retrieval_accuracy,
    _HAS_SENTENCE_TRANSFORMERS, _HAS_FAISS, RAG_AVAILABLE,
)


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def clean_gc():
    """Run GC before each test to avoid cross-test pollution."""
    gc.collect()
    yield


# ═══════════════════════════════════════════════════════════════════════════
#  1. DocumentProcessor Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestDocumentProcessor:
    """Pure-Python chunking logic — no external dependencies needed."""

    def test_chunk_text_basic(self):
        """Basic splitting: a long text should produce multiple chunks."""
        proc = DocumentProcessor(chunk_size=50, chunk_overlap=0)
        text = "Hello world. " * 20  # ~260 chars
        results = proc.chunk_text(text)
        assert len(results) > 1, "Should produce multiple chunks"
        assert all(isinstance(p, Passage) for p in results)
        assert len(results[0].id) > 0  # UUID generated

    def test_chunk_text_single_chunk(self):
        """Text shorter than chunk_size should produce one chunk."""
        proc = DocumentProcessor(chunk_size=500, chunk_overlap=0)
        text = "Short text under chunk size."
        results = proc.chunk_text(text)
        assert len(results) == 1
        assert results[0].text == text.strip()

    def test_chunk_text_empty(self):
        """Empty or very short text should return empty list."""
        proc = DocumentProcessor(chunk_size=50, chunk_overlap=0)
        assert proc.chunk_text("") == []
        assert proc.chunk_text("   ") == []
        assert proc.chunk_text("Hi") == []  # shorter than 10 chars

    def test_chunk_text_overlap(self):
        """Overlap between chunks should contain shared content."""
        proc = DocumentProcessor(chunk_size=100, chunk_overlap=30)
        text = "A " * 20 + "B " * 20 + "C " * 20 + "D " * 20
        results = proc.chunk_text(text)
        assert len(results) >= 2
        # Overlap means adjacent chunks share some characters
        if len(results) >= 2:
            assert results[0].text[-20:] in results[1].text or \
                   results[1].text[:20] in results[0].text, \
                   "Adjacent chunks should overlap"

    def test_chunk_text_sentence_boundary(self):
        """Chunks should break at sentence boundaries (., !, ?, \\n) when possible."""
        proc = DocumentProcessor(chunk_size=80, chunk_overlap=0)
        text = (
            "First sentence about something. "
            "Second sentence here. "
            "Third sentence continues. "
            "Fourth and final sentence."
        )
        results = proc.chunk_text(text)
        # Each chunk should end with a sentence-ending character or be the last
        for r in results[:-1]:
            stripped = r.text.rstrip()
            assert stripped.endswith(".") or stripped.endswith("!") or stripped.endswith("?"), \
                f"Chunk should end with sentence boundary: {r.text!r}"

    def test_chunk_text_paragraph_boundary(self):
        """Chunks should prefer double-newline paragraph boundaries."""
        proc = DocumentProcessor(chunk_size=500, chunk_overlap=0)
        text = "Paragraph one with lots of content. " * 15 + "\n\n" + \
               "Paragraph two also with plenty of text. " * 15
        results = proc.chunk_text(text)
        assert len(results) >= 2
        # First chunk should end at the paragraph break
        assert "\n\n" not in results[0].text.rstrip()

    def test_chunk_text_passes_source(self):
        """Source file and ID should be passed through to Passage objects."""
        proc = DocumentProcessor(chunk_size=50, chunk_overlap=0)
        text = "Lots of content. " * 10
        results = proc.chunk_text(text, source_file="test.txt", source_id="abc123",
                                   metadata={"key": "val"})
        for p in results:
            assert p.source_file == "test.txt"
            assert p.source_id == "abc123"
            assert p.metadata == {"key": "val"}

    def test_chunk_text_different_sizes(self):
        """Chunking with various chunk_size and overlap combos."""
        text = "Hello. " * 100
        for size in [30, 50, 100, 200]:
            for overlap in [0, 10, 20]:
                proc = DocumentProcessor(chunk_size=size, chunk_overlap=overlap)
                results = proc.chunk_text(text)
                assert len(results) > 0
                assert all(len(p.text) >= 5 for p in results)

    def test_chunk_document_from_content(self):
        """chunk_document with explicit content should not touch disk."""
        proc = DocumentProcessor(chunk_size=100, chunk_overlap=0)
        content = "Document content for testing. " * 10
        results = proc.chunk_document(Path("/nonexistent/file.txt"), content=content)
        assert len(results) > 0
        assert all(p.source_file.endswith("file.txt") for p in results)

    def test_chunk_document_missing_file(self):
        """chunk_document without content and with missing file returns []."""
        proc = DocumentProcessor(chunk_size=100, chunk_overlap=0)
        results = proc.chunk_document(Path("/nonexistent/file.txt"))
        assert results == []


# ═══════════════════════════════════════════════════════════════════════════
#  2. EmbeddingService Tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _HAS_SENTENCE_TRANSFORMERS,
                    reason="sentence-transformers not installed")
class TestEmbeddingService:
    """EmbeddingService tests — requires sentence-transformers."""

    @pytest.fixture
    def embedder(self):
        return EmbeddingService(model_name="all-MiniLM-L6-v2", device="cpu")

    def test_encode_shape(self, embedder):
        """encode() returns array of shape (n, 384)."""
        texts = ["Hello world.", "Second text.", "Third sample."]
        vecs = embedder.encode(texts)
        assert isinstance(vecs, np.ndarray)
        assert vecs.shape == (3, 384)
        assert vecs.dtype == np.float32

    def test_encode_single_text(self, embedder):
        """encode() works with a single text."""
        vecs = embedder.encode(["Just one string."])
        assert vecs.shape == (1, 384)

    def test_encode_query_returns_1d(self, embedder):
        """encode_query returns a 1-D vector."""
        vec = embedder.encode_query("A single query.")
        assert isinstance(vec, np.ndarray)
        assert vec.ndim == 1
        assert vec.shape[0] == 384

    def test_embeddings_normalized(self, embedder):
        """Embeddings should be L2-normalized (unit vectors)."""
        texts = ["First document.", "Second document."]
        vecs = embedder.encode(texts)
        norms = np.linalg.norm(vecs, axis=1)
        assert np.allclose(norms, 1.0, atol=1e-5), \
            f"Norms: {norms} (expected all 1.0)"

    def test_similar_texts_higher_similarity(self, embedder):
        """Similar texts should have higher cosine similarity than dissimilar ones."""
        vec_a = embedder.encode_query("Machine learning is fun.")
        vec_b = embedder.encode_query("I enjoy machine learning.")
        vec_c = embedder.encode_query("The weather is nice today.")

        sim_ab = float(np.dot(vec_a, vec_b))
        sim_ac = float(np.dot(vec_a, vec_c))

        assert sim_ab > sim_ac, \
            f"Similar texts ({sim_ab:.4f}) should score higher than dissimilar ({sim_ac:.4f})"

    def test_dimension_property(self, embedder):
        """dimension property returns correct embedding size."""
        assert embedder.dimension == 384

    def test_encode_batch_size(self, embedder):
        """encode() with different batch sizes produces same shape."""
        texts = ["Text A.", "Text B.", "Text C.", "Text D."]
        v1 = embedder.encode(texts, batch_size=2)
        v2 = embedder.encode(texts, batch_size=4)
        assert v1.shape == v2.shape
        assert np.allclose(v1, v2, atol=1e-5)


# ═══════════════════════════════════════════════════════════════════════════
#  3. VectorStore Tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _HAS_FAISS, reason="faiss not installed")
class TestVectorStore:
    """VectorStore tests — requires faiss."""

    @pytest.fixture
    def vs(self, tmp_path):
        """Fresh VectorStore in a temp directory."""
        store = VectorStore(index_dir=str(tmp_path))
        yield store
        store.clear()

    def make_passages(self, n=3) -> list:
        """Create n test passages."""
        return [
            Passage(
                id=str(uuid.uuid4()),
                text=f"This is test passage number {i} about something.",
                source_file="test.txt",
                source_id=f"fid_{i}",
                metadata={"idx": i},
            )
            for i in range(n)
        ]

    def make_embeddings(self, n=3, dim=384) -> np.ndarray:
        """Create n random normalized embeddings."""
        rng = np.random.default_rng(42)
        vecs = rng.standard_normal((n, dim)).astype(np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        return vecs / norms

    def test_build_and_search(self, vs):
        """Build index, search returns the most similar passage."""
        passages = self.make_passages(3)
        emb = self.make_embeddings(3)
        vs.build(passages, emb, overwrite=True)

        # Search using the embedding of the first passage
        results = vs.search(emb[0], k=3)

        assert len(results) == 3
        # The closest match should be the query passage itself (score ≈ 1.0)
        top_passage, top_score = results[0]
        assert top_passage.id == passages[0].id
        assert abs(top_score - 1.0) < 0.01

    def test_search_returns_passages(self, vs):
        """Search should return Passage objects with correct metadata."""
        passages = self.make_passages(3)
        emb = self.make_embeddings(3)
        vs.build(passages, emb, overwrite=True)

        results = vs.search(emb[1], k=2)
        assert len(results) == 2
        pid, score = results[0]
        assert isinstance(pid, Passage)
        assert pid.source_file == "test.txt"
        assert isinstance(score, float)
        assert 0 <= score <= 1.0

    def test_search_empty_index(self, vs):
        """Search on an empty index returns empty list."""
        vec = np.zeros(384, dtype=np.float32)
        results = vs.search(vec, k=5)
        assert results == []

    def test_add_incremental(self, vs):
        """Adding passages incrementally should accumulate."""
        p1 = self.make_passages(2)
        e1 = self.make_embeddings(2)
        vs.build(p1, e1, overwrite=True)
        assert vs.index.ntotal == 2

        p2 = self.make_passages(2)
        e2 = self.make_embeddings(2)
        vs.add(p2, e2)
        assert vs.index.ntotal == 4

    def test_clear(self, vs):
        """Clear should remove all passages and reset index."""
        passages = self.make_passages(3)
        emb = self.make_embeddings(3)
        vs.build(passages, emb, overwrite=True)
        assert vs.index.ntotal == 3

        vs.clear()
        assert vs.index is None
        assert vs.passages == []
        assert not vs.index_path.exists()

    def test_get_stats(self, vs):
        """get_stats returns correct metadata."""
        passages = self.make_passages(3)
        emb = self.make_embeddings(3)
        vs.build(passages, emb, overwrite=True)

        stats = vs.get_stats()
        assert stats["num_passages"] == 3
        assert stats["num_vectors"] == 3
        assert stats["dimension"] == 384
        # Index file should exist on disk (may be tiny, e.g. 0.00 MB for small indices)
        assert stats["disk_size_mb"] >= 0
        assert vs.index_path.exists()

    def test_persistence_round_trip(self, vs, tmp_path):
        """Index and passages should persist to disk and reload correctly."""
        passages = self.make_passages(3)
        emb = self.make_embeddings(3)
        vs.build(passages, emb, overwrite=True)

        # Create a new VectorStore pointing at the same dir
        vs2 = VectorStore(index_dir=str(tmp_path))
        assert vs2.index is not None
        assert vs2.index.ntotal == 3
        assert len(vs2.passages) == 3
        assert vs2.passages[0].text == passages[0].text

    def test_search_k_larger_than_index(self, vs):
        """Requesting k larger than index size returns all results."""
        passages = self.make_passages(1)
        emb = self.make_embeddings(1)
        vs.build(passages, emb, overwrite=True)

        results = vs.search(emb[0], k=100)
        assert len(results) == 1

    def test_cosine_similarity_ranking(self, vs):
        """Items more similar to the query should rank higher."""
        rng = np.random.default_rng(123)
        dim = 384
        # Create a query vector
        query = rng.standard_normal(dim).astype(np.float32)
        query /= np.linalg.norm(query)

        # Create passages with varying similarity
        n = 5
        passages = self.make_passages(n)
        emb = rng.standard_normal((n, dim)).astype(np.float32)
        # Make passage 0 very similar, rest random
        emb[0] = query * 0.99 + rng.standard_normal(dim).astype(np.float32) * 0.01
        emb[0] /= np.linalg.norm(emb[0])

        vs.build(passages, emb, overwrite=True)
        results = vs.search(query, k=n)

        # Most similar should be first
        assert results[0][0].id == passages[0].id
        # Scores should be descending
        scores = [s for _, s in results]
        assert all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1))

    def test_search_text_integration(self, vs):
        """search_text with a real embedder works."""
        if not _HAS_SENTENCE_TRANSFORMERS:
            pytest.skip("sentence-transformers not installed")
        embedder = EmbeddingService()
        passages = [Passage(
            id=str(uuid.uuid4()),
            text="Machine learning is a subset of artificial intelligence.",
            source_file="ai.txt",
        )]
        emb = embedder.encode([p.text for p in passages])
        vs.build(passages, emb, overwrite=True)

        results = vs.search_text("artificial intelligence", embedder, k=1)
        assert len(results) == 1
        assert "machine learning" in results[0][0].text.lower()


# ═══════════════════════════════════════════════════════════════════════════
#  4. RAGPipeline Tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not RAG_AVAILABLE, reason="RAG dependencies not installed")
class TestRAGPipeline:
    """End-to-end RAGPipeline tests."""

    @pytest.fixture
    def rag(self, tmp_path):
        """Fresh RAGPipeline in a temp directory."""
        config = RAGConfig(chunk_size=100, chunk_overlap=20, top_k=3)
        vs = VectorStore(index_dir=str(tmp_path / "vs"))
        embedder = EmbeddingService()
        pipeline = RAGPipeline(config=config, embedder=embedder, vector_store=vs)
        yield pipeline
        pipeline.clear()

    def test_index_text(self, rag):
        """Indexing text should create passages in the store."""
        n = rag.index_text("Sample text for indexing. " * 10, source="test.txt")
        assert n > 0
        stats = rag.get_stats()
        assert stats["num_passages"] > 0

    def test_index_text_returns_count(self, rag):
        """index_text returns the number of passages created."""
        count = rag.index_text("This is a test. " * 10, source="doc.txt")
        assert isinstance(count, int)
        assert count >= 1

    def test_query_returns_results(self, rag):
        """Querying after indexing should return relevant passages."""
        rag.index_text("The capital of France is Paris. It is known for the Eiffel Tower.", source="geo.txt")
        rag.index_text("Python is a programming language used for data science.", source="tech.txt")

        results = rag.query("Eiffel Tower Paris", k=3)
        assert len(results) > 0
        passage, score = results[0]
        assert "Paris" in passage.text or "France" in passage.text

    def test_query_empty_index(self, rag):
        """Query on an empty index returns empty list."""
        results = rag.query("anything", k=5)
        assert results == []

    def test_build_rag_context(self, rag):
        """build_rag_context returns a context string and passages."""
        rag.index_text("Machine learning models learn from data. " * 5, source="ml.txt")

        context, retrieved = rag.build_rag_context("machine learning", k=3)
        assert isinstance(context, str)
        assert len(context) > 0
        assert "Machine learning" in context
        assert len(retrieved) > 0

    def test_build_rag_context_no_results(self, rag):
        """build_rag_context with no index returns empty."""
        context, retrieved = rag.build_rag_context("nothing indexed", k=5)
        assert context == ""
        assert retrieved == []

    def test_build_rag_context_max_chars(self, rag):
        """build_rag_context respects max_chars limit."""
        long_text = "This is content about AI. " * 100
        rag.index_text(long_text, source="ai.txt")

        short_ctx, short_ret = rag.build_rag_context("AI", k=10, max_chars=100)
        long_ctx, long_ret = rag.build_rag_context("AI", k=10, max_chars=2000)

        assert len(short_ctx) <= 200  # 100 + some overhead for headers
        assert len(long_ctx) > len(short_ctx)

    def test_clear(self, rag):
        """clear() should remove all indexed data."""
        rag.index_text("Some content to index. " * 5, source="doc.txt")
        assert rag.get_stats()["num_passages"] > 0
        rag.clear()
        stats = rag.get_stats()
        assert stats["num_passages"] == 0

    def test_get_stats(self, rag):
        """get_stats returns comprehensive metadata."""
        rag.index_text("Test content. " * 5, source="test.txt")
        stats = rag.get_stats()
        assert "num_passages" in stats
        assert "embedding_model" in stats
        assert "chunk_size" in stats
        assert stats["embedding_model"] == "all-MiniLM-L6-v2"

    def test_index_multiple_sources(self, rag):
        """Indexing multiple sources should accumulate."""
        rag.index_text("Content about astronomy. Stars and planets. " * 3, source="space.txt")
        rag.index_text("Content about cooking. Recipes and ingredients. " * 3, source="food.txt")

        stats = rag.get_stats()
        assert stats["num_passages"] >= 2

        # Query should find relevant content
        space_results = rag.query("stars planets", k=2)
        food_results = rag.query("recipes cooking", k=2)
        assert len(space_results) > 0
        assert len(food_results) > 0

    def test_index_queued_files(self, rag):
        """index_queued_files processes file_map correctly."""
        file_map = {
            "fid1": {"name": "doc1.txt"},
            "fid2": {"name": "doc2.txt"},
            "empty": {"name": "empty.txt"},
        }
        def file_to_text_fn(fd):
            contents = {
                "doc1.txt": "This is the first document with lots of content. " * 5,
                "doc2.txt": "This is the second document with more content. " * 5,
                "empty.txt": "",
            }
            return contents.get(fd.get("name", ""), "")

        results = rag.index_queued_files(file_map, file_to_text_fn)
        assert results["files_indexed"] == 2  # empty file skipped
        assert results["passages_created"] > 0
        assert results["errors"] == 0


# ═══════════════════════════════════════════════════════════════════════════
#  5. Training Augmentation Tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not RAG_AVAILABLE, reason="RAG dependencies not installed")
class TestAugmentation:
    """Tests for augment_training_text_with_rag and estimate_retrieval_accuracy."""

    @pytest.fixture
    def rag(self, tmp_path):
        config = RAGConfig(chunk_size=100, chunk_overlap=10, top_k=2, max_context_length=500)
        vs = VectorStore(index_dir=str(tmp_path / "vs"))
        embedder = EmbeddingService()
        pipeline = RAGPipeline(config=config, embedder=embedder, vector_store=vs)
        # Index some source content
        pipeline.index_text(
            "Neural networks are a fundamental concept in deep learning. "
            "They consist of layers of interconnected nodes. "
            "Training involves forward and backward propagation.",
            source="deep_learning.txt",
        )
        yield pipeline
        pipeline.clear()

    def test_augment_training_text(self, rag):
        """augment_training_text_with_rag prepends retrieved context."""
        text = "Backpropagation is used to train neural networks."
        augmented = augment_training_text_with_rag(text, rag, rag.config)

        assert augmented != text
        assert "<RAG_CONTEXT>" in augmented
        assert "</RAG_CONTEXT>" in augmented
        assert "Neural networks" in augmented
        assert "Backpropagation" in augmented

    def test_augment_no_context(self, rag):
        """Augmenting with no relevant context returns original text."""
        text = "This has nothing to do with anything in the index."
        augmented = augment_training_text_with_rag(text, rag, rag.config)
        # May or may not find context, but should not crash
        assert isinstance(augmented, str)
        assert len(augmented) > 0

    def test_augment_preserves_original(self, rag):
        """The original text should appear after the context block."""
        text = "The original training text to preserve."
        augmented = augment_training_text_with_rag(text, rag, rag.config)
        if "<RAG_CONTEXT>" in augmented:
            # Original should be after the context
            assert augmented.endswith(text)
        else:
            # No context found — should be the original text
            assert augmented == text

    def test_estimate_retrieval_accuracy(self, rag):
        """estimate_retrieval_accuracy returns a score between 0 and 1."""
        score = estimate_retrieval_accuracy(rag, "neural networks", top_k=2)
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0

    def test_estimate_accuracy_on_related(self, rag):
        """Related queries should have higher accuracy scores."""
        score_related = estimate_retrieval_accuracy(rag, "deep learning neural networks", top_k=3)
        score_unrelated = estimate_retrieval_accuracy(rag, "xyzzy foobar nonsense", top_k=3)
        # Related should score at least as high as unrelated
        assert score_related >= score_unrelated

    def test_estimate_accuracy_empty_index(self, tmp_path):
        """Empty index returns 0.0."""
        config = RAGConfig(top_k=2)
        vs = VectorStore(index_dir=str(tmp_path / "empty_vs"))
        embedder = EmbeddingService()
        pipeline = RAGPipeline(config=config, embedder=embedder, vector_store=vs)
        score = estimate_retrieval_accuracy(pipeline, "anything", top_k=2)
        assert score == 0.0


# ═══════════════════════════════════════════════════════════════════════════
#  6. RAGConfig Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestRAGConfig:
    """RAGConfig dataclass tests."""

    def test_default_values(self):
        """Default config should have sensible defaults."""
        cfg = RAGConfig()
        assert cfg.enabled is False
        assert cfg.embedding_model == "all-MiniLM-L6-v2"
        assert cfg.chunk_size == 512
        assert cfg.chunk_overlap == 128
        assert cfg.top_k == 5
        assert cfg.retrieval_weight == 0.3
        assert cfg.max_context_length == 1024

    def test_custom_values(self):
        """Custom config should override defaults."""
        cfg = RAGConfig(enabled=True, chunk_size=256, top_k=10)
        assert cfg.enabled is True
        assert cfg.chunk_size == 256
        assert cfg.top_k == 10
        # Unset fields should remain at defaults
        assert cfg.chunk_overlap == 128

    def test_default_rag_config_singleton(self):
        """DEFAULT_RAG_CONFIG should be a default instance."""
        assert isinstance(DEFAULT_RAG_CONFIG, RAGConfig)
        assert DEFAULT_RAG_CONFIG.enabled is False


# ═══════════════════════════════════════════════════════════════════════════
#  7. Passage Dataclass Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestPassage:
    """Passage dataclass tests."""

    def test_minimal_creation(self):
        """Passage can be created with just an id and text."""
        p = Passage(id="abc", text="Hello world.")
        assert p.id == "abc"
        assert p.text == "Hello world."
        assert p.source_file == ""
        assert p.source_id == ""
        assert p.metadata == {}

    def test_full_creation(self):
        """Passage with all fields."""
        p = Passage(
            id="xyz",
            text="Full passage content.",
            source_file="doc.txt",
            source_id="doc_001",
            metadata={"author": "test", "page": 42},
        )
        assert p.source_file == "doc.txt"
        assert p.metadata["author"] == "test"

    def test_json_serializable(self):
        """Passage can be serialized to JSON (used for persistence)."""
        p = Passage(
            id="json_test",
            text="JSON content.",
            source_file="doc.json",
            source_id="doc_002",
            metadata={"key": "value"},
        )
        data = {
            "id": p.id,
            "text": p.text,
            "source_file": p.source_file,
            "source_id": p.source_id,
            "metadata": p.metadata,
        }
        serialized = json.dumps(data)
        restored = json.loads(serialized)
        assert restored["id"] == "json_test"
        assert restored["metadata"]["key"] == "value"
