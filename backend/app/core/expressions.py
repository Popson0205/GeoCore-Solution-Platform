"""Safe evaluator for form calculations (blueprint section 12: Forms and
Field Data Collection — calculated fields, e.g. "area = {width} * {depth}").

Expressions are never passed to eval(). The raw string is parsed with
Python's `ast` module and only a small allow-list of node types and
function names is permitted — anything else (attribute access, imports,
comprehensions, name lookups outside a whitelisted function call) is
rejected before anything executes.
"""

import ast
import operator
import re

_FIELD_REF = re.compile(r"\{([a-zA-Z0-9_]+)\}")

_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_ALLOWED_UNARYOPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}
_ALLOWED_FUNCS = {
    "round": lambda x, n=0: round(x, n),
    "abs": abs,
    "min": min,
    "max": max,
    "sum": sum,
}


class ExpressionError(ValueError):
    pass


def referenced_fields(expression: str) -> set[str]:
    """Every {field_key} referenced by an expression — used by the builder
    UI to warn about typos before saving a form.
    """
    return set(_FIELD_REF.findall(expression))


def evaluate(expression: str, values: dict):
    """Substitute {field_key} references with their current values, then
    safely evaluate the arithmetic. A referenced field that hasn't been
    answered yet is treated as 0 (numeric) rather than raising, so a
    calculated field can still preview a value while a form is mid-fill.
    """

    def substitute(match: re.Match) -> str:
        key = match.group(1)
        value = values.get(key)
        if value is None or value == "":
            return "0"
        if isinstance(value, bool):
            raise ExpressionError(f"Field '{key}' is a yes/no field and can't be used in a calculation")
        if isinstance(value, (int, float)):
            return repr(value)
        if isinstance(value, str):
            return repr(value)
        raise ExpressionError(f"Field '{key}' can't be used in a calculation")

    substituted = _FIELD_REF.sub(substitute, expression)

    try:
        tree = ast.parse(substituted, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Invalid expression syntax near: {exc.text or expression}") from exc

    return _eval_node(tree.body)


def _eval_node(node: ast.AST):
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, str)) and not isinstance(node.value, bool):
            return node.value
        raise ExpressionError("Unsupported constant in expression")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        try:
            return _ALLOWED_BINOPS[type(node.op)](left, right)
        except ZeroDivisionError:
            raise ExpressionError("Division by zero in calculation")
        except TypeError as exc:
            raise ExpressionError(f"Can't combine those values: {exc}") from exc
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARYOPS:
        return _ALLOWED_UNARYOPS[type(node.op)](_eval_node(node.operand))
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCS:
            raise ExpressionError("Only round(), abs(), min(), max() and sum() are allowed")
        if node.keywords:
            raise ExpressionError("Keyword arguments aren't supported in calculations")
        args = [_eval_node(arg) for arg in node.args]
        return _ALLOWED_FUNCS[node.func.id](*args)
    if isinstance(node, ast.List):
        return [_eval_node(elt) for elt in node.elts]
    raise ExpressionError(f"Unsupported expression syntax: {type(node).__name__}")
