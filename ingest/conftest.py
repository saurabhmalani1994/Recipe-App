"""pytest's default norecursedirs skips any directory named `build`, which would silently drop
ingest/build/test_build.py from `pytest ingest`. Collect it explicitly."""


def pytest_ignore_collect(collection_path, config):
    if collection_path.name == 'build' and collection_path.parent.name == 'ingest':
        return False
    return None
