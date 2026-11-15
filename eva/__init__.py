"""Package initialization for eva module."""
import os, sys, importlib.util

def _load_submodule(mod_name, filename):
    pkg_dir = os.path.dirname(__file__)
    path = os.path.join(pkg_dir, filename)
    if os.path.exists(path):
        full_name = f"eva.{mod_name}"
        if full_name not in sys.modules:
            spec = importlib.util.spec_from_file_location(full_name, path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[full_name] = mod
            spec.loader.exec_module(mod)
        else:
            mod = sys.modules[full_name]
        this_mod = sys.modules.get("eva")
        if this_mod:
            setattr(this_mod, mod_name, mod)
        return mod

multi_agent = _load_submodule("multi_agent", "multi_agent.py")
