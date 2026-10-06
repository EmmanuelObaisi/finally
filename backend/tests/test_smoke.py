"""Smoke test: the app package imports."""


def test_app_package_imports():
    import app

    assert app is not None
