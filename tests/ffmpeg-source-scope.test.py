"""Tests for the deliberately limited generated-GN source-list evaluator."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('scope', Path(__file__).resolve().parents[1] /
                                             'scripts/audit-ffmpeg-source-scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class ScopeTests(unittest.TestCase):
    def test_target_selection(self):
        text = '''
import("ffmpeg_options.gni")
ffmpeg_c_sources = ["common.c"]
use_linux_config = is_linux || is_chromeos || is_fuchsia
if (is_apple && current_cpu == "x64") { ffmpeg_c_sources += ["mac.c"] }
if (is_win) { ffmpeg_c_sources += ["win.c"] }
if (use_linux_config) { ffmpeg_c_sources += ["linux.c"] }
'''
        self.assertEqual(scope.source_lists(text, 'mac')['ffmpeg_c_sources'], ['common.c', 'mac.c'])
        self.assertEqual(scope.source_lists(text, 'win')['ffmpeg_c_sources'], ['common.c', 'win.c'])

    def test_unknown_flag_is_not_assumed_false(self):
        with self.assertRaises(KeyError):
            scope.source_lists('if (is_apple || new_unknown_flag) {}', 'mac')

    def test_new_gn_construct_is_rejected(self):
        with self.assertRaises(ValueError):
            scope.source_lists('foreach(x, sources) {}', 'mac')

    def test_no_arbitrary_expression_execution(self):
        with self.assertRaises(ValueError):
            scope.expression('__import__("os")', {})

    def test_unknown_import_is_rejected(self):
        with self.assertRaises(ValueError):
            scope.source_lists('import("new-flags.gni")', 'mac')


if __name__ == '__main__':
    unittest.main()
