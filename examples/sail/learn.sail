// This example introduces most basic features of Sail.
/* Comments are C-style. */

// Global mutable variables are introduced with 'register'.
// They must include a type (int) and can include an initialiser (= 0).
register my_global_int : int = 0

// `int` is the type for all integers (any size, like in Python). `nat` is
// for natural numbers (>= 0).
// Try changing the 3 to -3.
register not_negative : nat = 3

// This is a simple function. Sail is expression-based like Rust, OCaml,
// Haskell, etc. Braces are not required for function bodies if they are
// a single expression.
function add_ints(a : int, b : int) -> int = a + b

// As usual in expression-based languages, if and match are also expressions.
function max(a : int, b : int) -> int = if a > b then a else b

// You can use traditional imperative forms too but it isn't recommended.
function max(a : int, b : int) -> int = {
    if a > b then {
        return a;
    } else {
        return b;
    }
}

// You can define a `main()` function which will be compiled to `zmain()` in C.
// The name mangling system for C is Z-encoding which basically double all
// z's and prepends a z. E.g. size -> zsizze
//
// Main returns `unit` which is like a 0-length tuple. It's used in places you
// might use `void` in C. Unlike `void` you can make a value of `unit` by writing
// `()`.
//
// Sail will optionally generate a C `main()` function that calls `zmain()`
// (this code).
function main() -> unit = {
    // The standard print function.
    print_endline("Hello world");
}
