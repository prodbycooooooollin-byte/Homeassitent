import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from matcher import count_hits
from db import Store


def test_matcher():
    assert count_hits("hallo zusammen, wie geht's") == 0
    assert count_hits("Nigger") == 1
    assert count_hits("nigga nigga, niggas") == 3
    assert count_hits("n i g g e r") == 1
    assert count_hits("Nigeria und Niger sind Länder") == 0


def test_store(tmp_path):
    s = Store(str(tmp_path / "t.db"))
    s.add(1, 10, 2); s.add(1, 20, 5); s.add(1, 10, 1)
    assert s.top(1) == [(20, 5), (10, 3)]
    s.set_optout(1, 20, True)
    s.add(1, 20, 3)
    assert s.get(1, 20) == 0
    s.set_optout(1, 20, False)
    s.add(1, 20, 1)
    assert s.get(1, 20) == 1
