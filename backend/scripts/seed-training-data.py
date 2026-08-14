#!/usr/bin/env python3
import json, uuid, shutil
from pathlib import Path
from datetime import datetime

project_root = Path(__file__).parent.parent.parent
src_uploads = project_root / 'llm-training-app' / 'data' / 'uploads'
dst_uploads = project_root / 'llm-training-app' / 'backend' / 'data' / 'uploads'
metadata_file = dst_uploads.parent / 'metadata.json'

dst_uploads.mkdir(parents=True, exist_ok=True)

captured = sorted(src_uploads.glob('*.jsonl'))
for cf in captured:
    shutil.copy2(cf, dst_uploads / cf.name)
    print(f'  Copied: {cf.name}')

files = {}
queue = []
codebuff_files = sorted(dst_uploads.glob('codebuff-capture-*.jsonl'))

for cf in codebuff_files:
    with open(cf) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                entry = json.loads(line)
                fid = str(uuid.uuid4())
                text = entry.get('text') or entry.get('response', '') or ''
                name = entry.get('filePath') or entry.get('title', 'unknown')
                files[fid] = {
                    'id': fid, 'name': str(name), 'saved_name': f'{fid}_captured',
                    'category': 'Ready for Training',
                    'themes': (entry.get('tags') or [])[:5],
                    'size': len(text), 'content_preview': text[:200],
                    'uploaded_at': datetime.now().isoformat(), 'in_queue': True,
                }
                queue.append(fid)
            except json.JSONDecodeError:
                pass

venorica_files = sorted(dst_uploads.glob('venorica-sheet-*.jsonl'))
for vf in venorica_files:
    with open(vf) as f:
        lines = f.readlines()
    entry_text = ' '.join(l.strip()[:200] for l in lines[:20])
    fid = str(uuid.uuid4())
    files[fid] = {
        'id': fid, 'name': vf.name, 'saved_name': f'{fid}_venorica',
        'category': 'Ready for Training',
        'themes': ['venorica', 'rnn', 'knowledge'],
        'size': vf.stat().st_size, 'content_preview': entry_text[:200],
        'uploaded_at': datetime.now().isoformat(), 'in_queue': True,
    }
    queue.append(fid)

metadata = {
    'files': files, 'training_queue': queue, 'epochs': 3,
    'model_metrics': {'parameters': 100_000_000, 'vector_store_size_mb': 10,
                      'accuracy': 0.0, 'loss': 2.5, 'tokens_processed': 0},
    'training_history': [], 'experiments': {},
}
metadata_file.write_text(json.dumps(metadata, indent=2))
print(f'\nSeeded {len(files)} files ({len(queue)} queued)')
