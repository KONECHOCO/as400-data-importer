import ast
import os
import unittest
from pathlib import Path


def _load_helper_functions():
    source = Path("backend/main.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    helpers = [
        node for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name in {"_as400_url", "_jt400_jar_path"}
    ]
    namespace = {"os": os}
    exec(compile(ast.Module(body=helpers, type_ignores=[]), "backend/main.py", "exec"), namespace)
    return namespace


class BackendJdbcHelperTests(unittest.TestCase):
    def test_as400_url_includes_configured_port(self):
        helpers = _load_helper_functions()

        url = helpers["_as400_url"]("as400.example", 449, "MYLIB", True, 15)

        self.assertTrue(url.startswith("jdbc:as400://as400.example:449/MYLIB;"))
        self.assertIn("secure=true", url)
        self.assertIn("loginTimeout=15", url)

    def test_as400_url_omits_library_for_libl(self):
        helpers = _load_helper_functions()

        url = helpers["_as400_url"]("as400.example", 446, "*LIBL", False, 10)

        self.assertTrue(url.startswith("jdbc:as400://as400.example:446/"))
        self.assertIn("secure=false", url)


if __name__ == "__main__":
    unittest.main()
