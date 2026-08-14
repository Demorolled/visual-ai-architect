#!/usr/bin/env python3
"""
Tests for the engine's retention-mix support (mix_paths / mix_ratio / row_caps).
Run:  python3 -m pytest training/gui_trainer/test_engine_mix.py -v
or:   python3 training/gui_trainer/test_engine_mix.py
"""
import json
import os
import random
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from training.gui_trainer.engine import GUITrainer, load_gui_dataset  # noqa: E402


class FakeTok:
    """Minimal tokenizer stand-in: records every user message it sees."""

    def __init__(self):
        self.pad_token_id = 0
        self.eos_token_id = 1
        self.seen = []

    def apply_chat_template(self, messages, **kwargs):
        self.seen.append(messages[1]['content'])  # the user message
        return list(range(len(messages[1]['content'])))


def _write_jsonl(path, n, prefix):
    with open(path, 'w') as f:
        for i in range(n):
            f.write(json.dumps({
                'instruction': f'{prefix} task {i}',
                'input': '',
                'output': 'x' * 30,
            }) + '\n')


def test_row_caps_sample_before_tokenization():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        gui = d / 'gui.jsonl'
        ret = d / 'ret.jsonl'
        _write_jsonl(gui, 10, 'GUI')
        _write_jsonl(ret, 100, 'RET')
        train, val = load_gui_dataset([str(gui), str(ret)], FakeTok(), 2048,
                                      row_caps={str(ret): 15})
        assert len(train) + len(val) == 25  # 10 uncapped + 15 capped


def test_retention_mix_caps_and_paths():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        gui = d / 'gui.jsonl'
        ret = d / 'ret.jsonl'
        _write_jsonl(gui, 10, 'GUI')
        _write_jsonl(ret, 100, 'RET')
        t = GUITrainer(str(d / 'models'))
        t.update_config(mix_paths=[str(ret)], mix_ratio=0.15)
        paths, caps, seed = t._apply_retention_mix([str(gui)])
        assert paths == [os.path.abspath(str(gui)), os.path.abspath(str(ret))]
        assert caps == {os.path.abspath(str(ret)): 15}
        assert seed == 42


def test_retention_mix_engine_sample_is_seeded_deterministic():
    """The ENGINE's sampling must match random.Random(mix_seed).sample over the
    valid rows — locks in the seed-42 contract the curriculum template relies on."""
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        gui = d / 'gui.jsonl'
        ret = d / 'ret.jsonl'
        _write_jsonl(gui, 3, 'GUI')
        _write_jsonl(ret, 50, 'RET')

        expected = random.Random(42).sample(
            [f'RET task {i}' for i in range(50)], 8)

        tok = FakeTok()
        load_gui_dataset([str(gui), str(ret)], tok, 2048,
                         row_caps={str(ret): 8})
        # The tokenizer is invoked twice per record (prompt + full) — dedupe.
        got = sorted({m for m in tok.seen if m.startswith('RET')})
        assert got == sorted(expected)


def test_mix_disabled_when_no_paths_or_zero_ratio():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        gui = d / 'gui.jsonl'
        _write_jsonl(gui, 10, 'GUI')
        t = GUITrainer(str(d / 'models'))
        # default config: no mix_paths
        paths, caps, _ = t._apply_retention_mix([str(gui)])
        assert caps is None and paths == [os.path.abspath(str(gui))]
        # explicit empty mix_paths (launcher --no-mix)
        t.update_config(mix_paths=[], mix_ratio=0.15)
        paths, caps, _ = t._apply_retention_mix([str(gui)])
        assert caps is None
        # ratio 0
        t.update_config(mix_paths=[str(d / 'nope.jsonl')], mix_ratio=0.0)
        paths, caps, _ = t._apply_retention_mix([str(gui)])
        assert caps is None


def test_missing_mix_file_skipped():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        gui = d / 'gui.jsonl'
        _write_jsonl(gui, 10, 'GUI')
        t = GUITrainer(str(d / 'models'))
        t.update_config(mix_paths=[str(d / 'missing.jsonl')], mix_ratio=0.15)
        paths, caps, _ = t._apply_retention_mix([str(gui)])
        assert paths == [os.path.abspath(str(gui))]
        assert caps is None


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for fn in fns:
        fn()
        print(f'  ✓ {fn.__name__}')
    print(f'All {len(fns)} tests passed.')
