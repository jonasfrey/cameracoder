const f_clamp = (n_value, n_min, n_max) =>
  Math.min(n_max, Math.max(n_min, Number.isFinite(n_value) ? n_value : 0));
const o_functions = {
  sin: [1, Math.sin],
  cos: [1, Math.cos],
  abs: [1, Math.abs],
  sqrt: [1, Math.sqrt],
  floor: [1, Math.floor],
  ceil: [1, Math.ceil],
  round: [1, Math.round],
  min: [2, Math.min],
  max: [2, Math.max],
  pow: [2, Math.pow],
  clamp: [3, f_clamp],
  mix: [3, (n_a, n_b, n_t) => n_a * (1 - n_t) + n_b * n_t],
  step: [2, (n_edge, n_value) => n_value < n_edge ? 0 : 1],
};
const o_variables = { r: 0, g: 1, b: 2, x: 3, y: 4, t: 5, l: 6 };
const o_precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "**": 3 };

/** Shared grammar for CPU reference and GLSL. No arbitrary code or shader injection. */
function f_parse_expression(s_source) {
  if (typeof s_source !== "string" || s_source.length > 300 || !s_source.trim()) {
    throw new Error("Use an expression of 1–300 characters per channel.");
  }
  const a_tokens = [];
  const o_pattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([a-zA-Z_]+)|(\*\*|[+\-*/%(),]))/gy;
  let n_cursor = 0;
  const s_text = s_source.trim();
  while (n_cursor < s_text.length) {
    o_pattern.lastIndex = n_cursor;
    const a_match = o_pattern.exec(s_text);
    if (!a_match) throw new Error(`Unexpected character at ${n_cursor + 1}.`);
    a_tokens.push(a_match[1] ?? a_match[2] ?? a_match[3]);
    n_cursor = o_pattern.lastIndex;
  }
  let n_index = 0, n_depth = 0;
  function f_atom() {
    if (++n_depth > 24) throw new Error("Expression is too deeply nested.");
    const s_token = a_tokens[n_index++];
    let o_result;
    if (s_token === "+" || s_token === "-") {
      o_result = { s_kind: "unary", s_name: s_token, a_args: [f_atom()] };
    } else if (s_token === "(") {
      o_result = f_expression(0);
      if (a_tokens[n_index++] !== ")") throw new Error("Missing closing parenthesis.");
    } else if (/^(\d|\.)/.test(s_token || "")) {
      o_result = { s_kind: "number", n_value: Number(s_token) };
    } else if (Object.hasOwn(o_variables, s_token)) {
      o_result = { s_kind: "variable", s_name: s_token };
    } else if (s_token === "pi") {
      o_result = { s_kind: "number", n_value: Math.PI };
    } else if (Object.hasOwn(o_functions, s_token)) {
      const n_count = o_functions[s_token][0];
      if (a_tokens[n_index++] !== "(") throw new Error(`Use ${s_token}(...).`);
      const a_args = [];
      for (let n_i = 0; n_i < n_count; n_i++) {
        a_args.push(f_expression(0));
        if (n_i < n_count - 1 && a_tokens[n_index++] !== ",") {
          throw new Error(`${s_token} needs ${n_count} arguments.`);
        }
      }
      if (a_tokens[n_index++] !== ")") throw new Error(`Invalid arguments for ${s_token}.`);
      o_result = { s_kind: "call", s_name: s_token, a_args };
    } else {
      throw new Error(`Unknown name: ${s_token || "end of expression"}.`);
    }
    n_depth--;
    return o_result;
  }
  function f_expression(n_min) {
    let o_left = f_atom();
    while (
      Object.hasOwn(o_precedence, a_tokens[n_index]) && o_precedence[a_tokens[n_index]] >= n_min
    ) {
      const s_operator = a_tokens[n_index++];
      const o_right = f_expression(o_precedence[s_operator] + (s_operator === "**" ? 0 : 1));
      o_left = { s_kind: "binary", s_name: s_operator, a_args: [o_left, o_right] };
    }
    return o_left;
  }
  const o_result = f_expression(0);
  if (n_index !== a_tokens.length) throw new Error("Unexpected token. Check the expression.");
  return o_result;
}

function f_compile_node(o_node) {
  if (o_node.s_kind === "number") return () => o_node.n_value;
  if (o_node.s_kind === "variable") return (a_values) => a_values[o_variables[o_node.s_name]];
  const a_args = o_node.a_args.map(f_compile_node);
  if (o_node.s_kind === "call") {
    return (a_values) => o_functions[o_node.s_name][1](...a_args.map((f_arg) => f_arg(a_values)));
  }
  if (o_node.s_kind === "unary") {
    return (a_values) => (o_node.s_name === "-" ? -1 : 1) * a_args[0](a_values);
  }
  return (a_values) => {
    const n_a = a_args[0](a_values), n_b = a_args[1](a_values);
    switch (o_node.s_name) {
      case "+":
        return n_a + n_b;
      case "-":
        return n_a - n_b;
      case "*":
        return n_a * n_b;
      case "/":
        return n_b ? n_a / n_b : 0;
      case "%":
        return n_b ? n_a % n_b : 0;
      default:
        return Math.pow(n_a, n_b);
    }
  };
}

function f_glsl_node(o_node) {
  if (o_node.s_kind === "number") {
    // Bound literals to GLSL highp floats. Overflow retains the channel's nonfinite-to-zero rule.
    if (o_node.n_value > 3.402823466e38) return "uintBitsToFloat(0x7f800000u)";
    const s_number = String(o_node.n_value);
    return /[.e]/i.test(s_number) ? s_number : `${s_number}.0`;
  }
  if (o_node.s_kind === "variable") return o_node.s_name;
  const a_args = o_node.a_args.map(f_glsl_node);
  if (o_node.s_kind === "unary") return `(${o_node.s_name}${a_args[0]})`;
  const o_helpers = {
    "/": "f_div",
    "%": "f_mod",
    "**": "f_pow",
    pow: "f_pow",
    round: "f_round",
    sqrt: "f_sqrt",
    clamp: "f_clamp",
  };
  if (o_helpers[o_node.s_name]) return `${o_helpers[o_node.s_name]}(${a_args.join(",")})`;
  if (o_node.s_kind === "call") return `${o_node.s_name}(${a_args.join(",")})`;
  return `(${a_args[0]}${o_node.s_name}${a_args[1]})`;
}

export function f_compile_expression(s_source) {
  return f_compile_node(f_parse_expression(s_source));
}

function f_validate_channels(a_expressions) {
  if (!Array.isArray(a_expressions) || a_expressions.length !== 3) {
    throw new Error("Provide red, green, and blue expressions.");
  }
  return a_expressions.map(f_parse_expression);
}

export function f_compile_custom(a_expressions) {
  return f_validate_channels(a_expressions).map(f_compile_node);
}

export function f_compile_custom_glsl(a_expressions) {
  return f_validate_channels(a_expressions).map(f_glsl_node);
}
