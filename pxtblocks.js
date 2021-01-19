var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
///<reference path='../localtypings/pxtblockly.d.ts'/>
/// <reference path="../built/pxtlib.d.ts" />
var iface;
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks_1) {
        function workerOpAsync(op, arg) {
            return pxt.worker.getWorker(pxt.webConfig.workerjs).opAsync(op, arg);
        }
        blocks_1.workerOpAsync = workerOpAsync;
        var placeholders = {};
        var MAX_COMMENT_LINE_LENGTH = 50;
        ///////////////////////////////////////////////////////////////////////////////
        // Miscellaneous utility functions
        ///////////////////////////////////////////////////////////////////////////////
        // Mutate [a1] in place and append to it the elements from [a2].
        function append(a1, a2) {
            a1.push.apply(a1, a2);
        }
        // A few wrappers for basic Block operations that throw errors when compilation
        // is not possible. (The outer code catches these and highlights the relevant
        // block.)
        // Internal error (in our code). Compilation shouldn't proceed.
        function assert(x) {
            if (!x)
                throw new Error("Assertion failure");
        }
        function throwBlockError(msg, block) {
            var e = new Error(msg);
            e.block = block;
            throw e;
        }
        ///////////////////////////////////////////////////////////////////////////////
        // Types
        //
        // We slap a very simple type system on top of Blockly. This is needed to ensure
        // we generate valid TouchDevelop code (otherwise compilation from TD to C++
        // would not work).
        ///////////////////////////////////////////////////////////////////////////////
        // There are several layers of abstraction for the type system.
        // - Block are annotated with a string return type, and a string type for their
        //   input blocks (see blocks-custom.js). We use that as the reference semantics
        //   for the blocks.
        // - In this "type system", we use the enum Type. Using an enum rules out more
        //   mistakes.
        // - When emitting code, we target the "TouchDevelop types".
        //
        // Type inference / checking is done as follows. First, we try to assign a type
        // to all variables. We do this by examining all variable assignments and
        // figuring out the type from the right-hand side. There's a fixpoint computation
        // (see [mkEnv]). Then, we propagate down the expected type when doing code
        // generation; when generating code for a variable dereference, if the expected
        // type doesn't match the inferred type, it's an error. If the type was
        // undetermined as of yet, the type of the variable becomes the expected type.
        var Point = /** @class */ (function () {
            function Point(link, type, parentType, childType, isArrayType) {
                this.link = link;
                this.type = type;
                this.parentType = parentType;
                this.childType = childType;
                this.isArrayType = isArrayType;
            }
            return Point;
        }());
        blocks_1.Point = Point;
        var BlockDeclarationType;
        (function (BlockDeclarationType) {
            BlockDeclarationType[BlockDeclarationType["None"] = 0] = "None";
            BlockDeclarationType[BlockDeclarationType["Argument"] = 1] = "Argument";
            BlockDeclarationType[BlockDeclarationType["Assigned"] = 2] = "Assigned";
            BlockDeclarationType[BlockDeclarationType["Implicit"] = 3] = "Implicit";
        })(BlockDeclarationType = blocks_1.BlockDeclarationType || (blocks_1.BlockDeclarationType = {}));
        function find(p) {
            if (p.link)
                return find(p.link);
            return p;
        }
        function union(p1, p2) {
            var _p1 = find(p1);
            var _p2 = find(p2);
            assert(_p1.link == null && _p2.link == null);
            if (_p1 == _p2)
                return;
            if (_p1.childType && _p2.childType) {
                var ct = _p1.childType;
                _p1.childType = null;
                union(ct, _p2.childType);
            }
            else if (_p1.childType && !_p2.childType) {
                _p2.childType = _p1.childType;
            }
            if (_p1.parentType && _p2.parentType) {
                var pt = _p1.parentType;
                _p1.parentType = null;
                union(pt, _p2.parentType);
            }
            else if (_p1.parentType && !_p2.parentType && !_p2.type) {
                _p2.parentType = _p1.parentType;
            }
            var t = unify(_p1.type, _p2.type);
            p1.link = _p2;
            _p1.link = _p2;
            _p1.isArrayType = _p2.isArrayType;
            p1.type = null;
            p2.type = t;
        }
        // Ground types.
        function mkPoint(t, isArrayType) {
            if (isArrayType === void 0) { isArrayType = false; }
            return new Point(null, t, null, null, isArrayType);
        }
        var pNumber = mkPoint("number");
        var pBoolean = mkPoint("boolean");
        var pString = mkPoint("string");
        var pUnit = mkPoint("void");
        function ground(t) {
            if (!t)
                return mkPoint(t);
            switch (t.toLowerCase()) {
                case "number": return pNumber;
                case "boolean": return pBoolean;
                case "string": return pString;
                case "void": return pUnit;
                default:
                    // Unification variable.
                    return mkPoint(t);
            }
        }
        ///////////////////////////////////////////////////////////////////////////////
        // Type inference
        //
        // Expressions are now directly compiled as a tree. This requires knowing, for
        // each property ref, the right value for its [parent] property.
        ///////////////////////////////////////////////////////////////////////////////
        // Infers the expected type of an expression by looking at the untranslated
        // block and figuring out, from the look of it, what type of expression it
        // holds.
        function returnType(e, b) {
            assert(b != null);
            if (isPlaceholderBlock(b)) {
                if (!b.p)
                    b.p = mkPoint(null);
                return find(b.p);
            }
            if (b.type == "variables_get")
                return find(lookup(e, b, b.getField("VAR").getText()).type);
            if (b.type == "function_call_output") {
                return getReturnTypeOfFunctionCall(e, b);
            }
            if (!b.outputConnection) {
                return ground(pUnit.type);
            }
            var check = b.outputConnection.check_ && b.outputConnection.check_.length ? b.outputConnection.check_[0] : "T";
            if (check === "Array") {
                if (b.outputConnection.check_.length > 1) {
                    // HACK: The real type is stored as the second check
                    return ground(b.outputConnection.check_[1]);
                }
                // The only block that hits this case should be lists_create_with, so we
                // can safely infer the type from the first input that has a return type
                var tp = void 0;
                if (b.inputList && b.inputList.length) {
                    for (var _i = 0, _a = b.inputList; _i < _a.length; _i++) {
                        var input = _a[_i];
                        if (input.connection && input.connection.targetBlock()) {
                            var t = find(returnType(e, input.connection.targetBlock()));
                            if (t) {
                                if (t.parentType) {
                                    return t.parentType;
                                }
                                tp = ground(t.type + "[]");
                                genericLink(tp, t);
                                break;
                            }
                        }
                    }
                }
                if (tp)
                    tp.isArrayType = true;
                return tp || mkPoint(null, true);
            }
            else if (check === "T") {
                var func_1 = e.stdCallTable[b.type];
                var isArrayGet = b.type === "lists_index_get";
                if (isArrayGet || func_1 && func_1.comp.thisParameter) {
                    var parentInput = void 0;
                    if (isArrayGet) {
                        parentInput = b.inputList.find(function (i) { return i.name === "LIST"; });
                    }
                    else {
                        parentInput = b.inputList.find(function (i) { return i.name === func_1.comp.thisParameter.definitionName; });
                    }
                    if (parentInput.connection && parentInput.connection.targetBlock()) {
                        var parentType = returnType(e, parentInput.connection.targetBlock());
                        if (parentType.childType) {
                            return parentType.childType;
                        }
                        var p = isArrayType(parentType.type) ? mkPoint(parentType.type.substr(0, parentType.type.length - 2)) : mkPoint(null);
                        genericLink(parentType, p);
                        return p;
                    }
                }
                return mkPoint(null);
            }
            return ground(check);
        }
        function getReturnTypeOfFunction(e, name) {
            if (!e.userFunctionReturnValues[name]) {
                var definition = Blockly.Functions.getDefinition(name, e.workspace);
                var res = mkPoint("void");
                if (isFunctionRecursive(definition, true)) {
                    res = mkPoint("any");
                }
                else {
                    var returnTypes = [];
                    for (var _i = 0, _a = definition.getDescendants(false); _i < _a.length; _i++) {
                        var child = _a[_i];
                        if (child.type === "function_return") {
                            attachPlaceholderIf(e, child, "RETURN_VALUE");
                            returnTypes.push(returnType(e, getInputTargetBlock(child, "RETURN_VALUE")));
                        }
                    }
                    if (returnTypes.length) {
                        try {
                            var unified = mkPoint(null);
                            for (var _b = 0, returnTypes_1 = returnTypes; _b < returnTypes_1.length; _b++) {
                                var point = returnTypes_1[_b];
                                union(unified, point);
                            }
                            res = unified;
                        }
                        catch (err) {
                            e.diagnostics.push({
                                blockId: definition.id,
                                message: pxt.Util.lf("Function '{0}' has an invalid return type", name)
                            });
                            res = mkPoint("any");
                        }
                    }
                }
                e.userFunctionReturnValues[name] = res;
            }
            return e.userFunctionReturnValues[name];
        }
        function getReturnTypeOfFunctionCall(e, call) {
            var name = call.getField("function_name").getText();
            return getReturnTypeOfFunction(e, name);
        }
        // Basic type unification routine; easy, because there's no structural types.
        // FIXME: Generics are not supported
        function unify(t1, t2) {
            if (t1 == null || t1 === "Array" && isArrayType(t2))
                return t2;
            else if (t2 == null || t2 === "Array" && isArrayType(t1))
                return t1;
            else if (t1 == t2)
                return t1;
            else
                throw new Error("cannot mix " + t1 + " with " + t2);
        }
        function isArrayType(type) {
            return type && type.indexOf("[]") !== -1;
        }
        function mkPlaceholderBlock(e, parent, type) {
            // XXX define a proper placeholder block type
            return {
                type: "placeholder",
                p: mkPoint(type || null),
                workspace: e.workspace,
                parentBlock_: parent
            };
        }
        function attachPlaceholderIf(e, b, n, type) {
            // Ugly hack to keep track of the type we want there.
            var target = b.getInputTargetBlock(n);
            if (!target) {
                if (!placeholders[b.id]) {
                    placeholders[b.id] = {};
                }
                if (!placeholders[b.id][n]) {
                    placeholders[b.id][n] = mkPlaceholderBlock(e, b, type);
                }
            }
            else if (target.type === pxtc.TS_OUTPUT_TYPE && !(target.p)) {
                target.p = mkPoint(null);
            }
        }
        function getLoopVariableField(b) {
            return (b.type == "pxt_controls_for" || b.type == "pxt_controls_for_of") ?
                getInputTargetBlock(b, "VAR") : b;
        }
        function getInputTargetBlock(b, n) {
            var res = b.getInputTargetBlock(n);
            if (!res) {
                return placeholders[b.id] && placeholders[b.id][n];
            }
            else {
                return res;
            }
        }
        function removeAllPlaceholders() {
            placeholders = {};
        }
        // Unify the *return* type of the parameter [n] of block [b] with point [p].
        function unionParam(e, b, n, p) {
            attachPlaceholderIf(e, b, n);
            try {
                union(returnType(e, getInputTargetBlock(b, n)), p);
            }
            catch (e) {
                // TypeScript should catch this error and bubble it up
            }
        }
        function infer(allBlocks, e, w) {
            if (allBlocks)
                allBlocks.filter(function (b) { return b.isEnabled(); }).forEach(function (b) {
                    try {
                        switch (b.type) {
                            case "math_op2":
                                unionParam(e, b, "x", ground(pNumber.type));
                                unionParam(e, b, "y", ground(pNumber.type));
                                break;
                            case "math_op3":
                                unionParam(e, b, "x", ground(pNumber.type));
                                break;
                            case "math_arithmetic":
                            case "logic_compare":
                                switch (b.getFieldValue("OP")) {
                                    case "ADD":
                                    case "MINUS":
                                    case "MULTIPLY":
                                    case "DIVIDE":
                                    case "LT":
                                    case "LTE":
                                    case "GT":
                                    case "GTE":
                                    case "POWER":
                                        unionParam(e, b, "A", ground(pNumber.type));
                                        unionParam(e, b, "B", ground(pNumber.type));
                                        break;
                                    case "AND":
                                    case "OR":
                                        attachPlaceholderIf(e, b, "A", pBoolean.type);
                                        attachPlaceholderIf(e, b, "B", pBoolean.type);
                                        break;
                                    case "EQ":
                                    case "NEQ":
                                        attachPlaceholderIf(e, b, "A");
                                        attachPlaceholderIf(e, b, "B");
                                        var p1_1 = returnType(e, getInputTargetBlock(b, "A"));
                                        var p2 = returnType(e, getInputTargetBlock(b, "B"));
                                        try {
                                            union(p1_1, p2);
                                        }
                                        catch (e) {
                                            // TypeScript should catch this error and bubble it up
                                        }
                                        break;
                                }
                                break;
                            case "logic_operation":
                                attachPlaceholderIf(e, b, "A", pBoolean.type);
                                attachPlaceholderIf(e, b, "B", pBoolean.type);
                                break;
                            case "logic_negate":
                                attachPlaceholderIf(e, b, "BOOL", pBoolean.type);
                                break;
                            case "controls_if":
                                for (var i = 0; i <= b.elseifCount_; ++i)
                                    attachPlaceholderIf(e, b, "IF" + i, pBoolean.type);
                                break;
                            case "pxt_controls_for":
                            case "controls_simple_for":
                                unionParam(e, b, "TO", ground(pNumber.type));
                                break;
                            case "pxt_controls_for_of":
                            case "controls_for_of":
                                var listTp = returnType(e, getInputTargetBlock(b, "LIST"));
                                var elementTp = lookup(e, b, getLoopVariableField(b).getField("VAR").getText()).type;
                                genericLink(listTp, elementTp);
                                break;
                            case "variables_set":
                            case "variables_change":
                                var p1 = lookup(e, b, b.getField("VAR").getText()).type;
                                attachPlaceholderIf(e, b, "VALUE");
                                var rhs = getInputTargetBlock(b, "VALUE");
                                if (rhs) {
                                    var tr = returnType(e, rhs);
                                    try {
                                        union(p1, tr);
                                    }
                                    catch (e) {
                                        // TypeScript should catch this error and bubble it up
                                    }
                                }
                                break;
                            case "controls_repeat_ext":
                                unionParam(e, b, "TIMES", ground(pNumber.type));
                                break;
                            case "device_while":
                                attachPlaceholderIf(e, b, "COND", pBoolean.type);
                                break;
                            case "lists_index_get":
                                unionParam(e, b, "LIST", ground("Array"));
                                unionParam(e, b, "INDEX", ground(pNumber.type));
                                var listType = returnType(e, getInputTargetBlock(b, "LIST"));
                                var ret = returnType(e, b);
                                genericLink(listType, ret);
                                break;
                            case "lists_index_set":
                                unionParam(e, b, "LIST", ground("Array"));
                                attachPlaceholderIf(e, b, "VALUE");
                                handleGenericType(b, "LIST");
                                unionParam(e, b, "INDEX", ground(pNumber.type));
                                break;
                            case 'function_definition':
                                getReturnTypeOfFunction(e, b.getField("function_name").getText());
                                break;
                            case 'function_call':
                            case 'function_call_output':
                                b.getArguments().forEach(function (arg) {
                                    unionParam(e, b, arg.id, ground(arg.type));
                                });
                                break;
                            case pxtc.TS_RETURN_STATEMENT_TYPE:
                                attachPlaceholderIf(e, b, "RETURN_VALUE");
                                break;
                            case pxtc.PAUSE_UNTIL_TYPE:
                                unionParam(e, b, "PREDICATE", pBoolean);
                                break;
                            default:
                                if (b.type in e.stdCallTable) {
                                    var call_1 = e.stdCallTable[b.type];
                                    if (call_1.attrs.shim === "ENUM_GET" || call_1.attrs.shim === "KIND_GET")
                                        return;
                                    visibleParams(call_1, countOptionals(b)).forEach(function (p, i) {
                                        var isInstance = call_1.isExtensionMethod && i === 0;
                                        if (p.definitionName && !b.getFieldValue(p.definitionName)) {
                                            var i_1 = b.inputList.find(function (i) { return i.name == p.definitionName; });
                                            if (i_1 && i_1.connection && i_1.connection.check_) {
                                                if (isInstance && connectionCheck(i_1) === "Array") {
                                                    var gen = handleGenericType(b, p.definitionName);
                                                    if (gen) {
                                                        return;
                                                    }
                                                }
                                                // All of our injected blocks have single output checks, but the builtin
                                                // blockly ones like string.length and array.length might have multiple
                                                for (var j = 0; j < i_1.connection.check_.length; j++) {
                                                    try {
                                                        var t = i_1.connection.check_[j];
                                                        unionParam(e, b, p.definitionName, ground(t));
                                                        break;
                                                    }
                                                    catch (e) {
                                                        // Ignore type checking errors in the blocks...
                                                    }
                                                }
                                            }
                                        }
                                    });
                                }
                        }
                    }
                    catch (err) {
                        var be = err.block || b;
                        be.setWarningText(err + "");
                        e.errors.push(be);
                    }
                });
            // Last pass: if some variable has no type (because it was never used or
            // assigned to), just unify it with int...
            e.allVariables.forEach(function (v) {
                if (getConcreteType(v.type).type == null)
                    union(v.type, ground(v.type.isArrayType ? "number[]" : pNumber.type));
            });
            function connectionCheck(i) {
                return i.name ? i.connection && i.connection.check_ && i.connection.check_.length ? i.connection.check_[0] : "T" : undefined;
            }
            function handleGenericType(b, name) {
                var genericArgs = b.inputList.filter(function (input) { return connectionCheck(input) === "T"; });
                if (genericArgs.length) {
                    var gen = getInputTargetBlock(b, genericArgs[0].name);
                    if (gen) {
                        var arg = returnType(e, gen);
                        var arrayType = arg.type ? ground(returnType(e, gen).type + "[]") : ground(null);
                        genericLink(arrayType, arg);
                        unionParam(e, b, name, arrayType);
                        return true;
                    }
                }
                return false;
            }
        }
        function genericLink(parent, child) {
            var p = find(parent);
            var c = find(child);
            if (p.childType) {
                union(p.childType, c);
            }
            else if (!p.type) {
                p.childType = c;
            }
            if (c.parentType) {
                union(c.parentType, p);
            }
            else if (!c.type) {
                c.parentType = p;
            }
            if (isArrayType(p.type))
                p.isArrayType = true;
        }
        function getConcreteType(point, found) {
            if (found === void 0) { found = []; }
            var t = find(point);
            if (found.indexOf(t) === -1) {
                found.push(t);
                if (!t.type || t.type === "Array") {
                    if (t.parentType) {
                        var parent_1 = getConcreteType(t.parentType, found);
                        if (parent_1.type && parent_1.type !== "Array") {
                            if (isArrayType(parent_1.type)) {
                                t.type = parent_1.type.substr(0, parent_1.type.length - 2);
                            }
                            else {
                                t.type = parent_1.type;
                            }
                            return t;
                        }
                    }
                    if (t.childType) {
                        var child = getConcreteType(t.childType, found);
                        if (child.type) {
                            t.type = child.type + "[]";
                            return t;
                        }
                    }
                }
            }
            return t;
        }
        ///////////////////////////////////////////////////////////////////////////////
        // Expressions
        //
        // Expressions are now directly compiled as a tree. This requires knowing, for
        // each property ref, the right value for its [parent] property.
        ///////////////////////////////////////////////////////////////////////////////
        function extractNumber(b) {
            var v = b.getFieldValue(b.type === "math_number_minmax" ? "SLIDER" : "NUM");
            var parsed = parseFloat(v);
            checkNumber(parsed, b);
            return parsed;
        }
        function checkNumber(n, b) {
            if (!isFinite(n) || isNaN(n)) {
                throwBlockError(lf("Number entered is either too large or too small"), b);
            }
        }
        function extractTsExpression(e, b, comments) {
            return blocks_1.mkText(b.getFieldValue("EXPRESSION").trim());
        }
        function compileNumber(e, b, comments) {
            return blocks_1.H.mkNumberLiteral(extractNumber(b));
        }
        var opToTok = {
            // POWER gets a special treatment because there's no operator for it in
            // TouchDevelop
            "ADD": "+",
            "MINUS": "-",
            "MULTIPLY": "*",
            "DIVIDE": "/",
            "LT": "<",
            "LTE": "<=",
            "GT": ">",
            "GTE": ">=",
            "AND": "&&",
            "OR": "||",
            "EQ": "==",
            "NEQ": "!=",
            "POWER": "**"
        };
        function compileArithmetic(e, b, comments) {
            var bOp = b.getFieldValue("OP");
            var left = getInputTargetBlock(b, "A");
            var right = getInputTargetBlock(b, "B");
            var args = [compileExpression(e, left, comments), compileExpression(e, right, comments)];
            var t = returnType(e, left).type;
            if (t == pString.type) {
                if (bOp == "EQ")
                    return blocks_1.H.mkSimpleCall("==", args);
                else if (bOp == "NEQ")
                    return blocks_1.H.mkSimpleCall("!=", args);
            }
            else if (t == pBoolean.type)
                return blocks_1.H.mkSimpleCall(opToTok[bOp], args);
            // Compilation of math operators.
            assert(bOp in opToTok);
            return blocks_1.H.mkSimpleCall(opToTok[bOp], args);
        }
        function compileModulo(e, b, comments) {
            var left = getInputTargetBlock(b, "DIVIDEND");
            var right = getInputTargetBlock(b, "DIVISOR");
            var args = [compileExpression(e, left, comments), compileExpression(e, right, comments)];
            return blocks_1.H.mkSimpleCall("%", args);
        }
        function compileMathOp2(e, b, comments) {
            var op = b.getFieldValue("op");
            var x = compileExpression(e, getInputTargetBlock(b, "x"), comments);
            var y = compileExpression(e, getInputTargetBlock(b, "y"), comments);
            return blocks_1.H.mathCall(op, [x, y]);
        }
        function compileMathOp3(e, b, comments) {
            var x = compileExpression(e, getInputTargetBlock(b, "x"), comments);
            return blocks_1.H.mathCall("abs", [x]);
        }
        function compileText(e, b, comments) {
            return blocks_1.H.mkStringLiteral(b.getFieldValue("TEXT"));
        }
        function compileTextJoin(e, b, comments) {
            var last;
            var i = 0;
            while (true) {
                var val = getInputTargetBlock(b, "ADD" + i);
                i++;
                if (!val) {
                    if (i < b.inputList.length) {
                        continue;
                    }
                    else {
                        break;
                    }
                }
                var compiled = compileExpression(e, val, comments);
                if (!last) {
                    if (val.type.indexOf("text") === 0) {
                        last = compiled;
                    }
                    else {
                        // If we don't start with a string, then the TS won't match
                        // the implied semantics of the blocks
                        last = blocks_1.H.mkSimpleCall("+", [blocks_1.H.mkStringLiteral(""), compiled]);
                    }
                }
                else {
                    last = blocks_1.H.mkSimpleCall("+", [last, compiled]);
                }
            }
            if (!last) {
                return blocks_1.H.mkStringLiteral("");
            }
            return last;
        }
        function compileBoolean(e, b, comments) {
            return blocks_1.H.mkBooleanLiteral(b.getFieldValue("BOOL") == "TRUE");
        }
        function compileNot(e, b, comments) {
            var expr = compileExpression(e, getInputTargetBlock(b, "BOOL"), comments);
            return blocks_1.mkPrefix("!", [blocks_1.H.mkParenthesizedExpression(expr)]);
        }
        function compileCreateList(e, b, comments) {
            // collect argument
            var args = b.inputList.map(function (input) { return input.connection && input.connection.targetBlock() ? compileExpression(e, input.connection.targetBlock(), comments) : undefined; })
                .filter(function (e) { return !!e; });
            return blocks_1.H.mkArrayLiteral(args, !b.getInputsInline());
        }
        function compileListGet(e, b, comments) {
            var listBlock = getInputTargetBlock(b, "LIST");
            var listExpr = compileExpression(e, listBlock, comments);
            var index = compileExpression(e, getInputTargetBlock(b, "INDEX"), comments);
            var res = blocks_1.mkGroup([listExpr, blocks_1.mkText("["), index, blocks_1.mkText("]")]);
            return res;
        }
        function compileListSet(e, b, comments) {
            var listBlock = getInputTargetBlock(b, "LIST");
            var listExpr = compileExpression(e, listBlock, comments);
            var index = compileExpression(e, getInputTargetBlock(b, "INDEX"), comments);
            var value = compileExpression(e, getInputTargetBlock(b, "VALUE"), comments);
            var res = blocks_1.mkGroup([listExpr, blocks_1.mkText("["), index, blocks_1.mkText("] = "), value]);
            return listBlock.type === "lists_create_with" ? prefixWithSemicolon(res) : res;
        }
        function compileMathJsOp(e, b, comments) {
            var op = b.getFieldValue("OP");
            var args = [compileExpression(e, getInputTargetBlock(b, "ARG0"), comments)];
            if (b.getInput("ARG1")) {
                args.push(compileExpression(e, getInputTargetBlock(b, "ARG1"), comments));
            }
            return blocks_1.H.mathCall(op, args);
        }
        function compileFunctionDefinition(e, b, comments) {
            var name = escapeVarName(b.getField("function_name").getText(), e, true);
            var stmts = getInputTargetBlock(b, "STACK");
            var argsDeclaration = b.getArguments().map(function (a) {
                return escapeVarName(a.name, e) + ": " + a.type;
            });
            var isRecursive = isFunctionRecursive(b, false);
            return [
                blocks_1.mkText("function " + name + " (" + argsDeclaration.join(", ") + ")" + (isRecursive ? ": any" : "")),
                compileStatements(e, stmts)
            ];
        }
        function compileProcedure(e, b, comments) {
            var name = escapeVarName(b.getFieldValue("NAME"), e, true);
            var stmts = getInputTargetBlock(b, "STACK");
            return [
                blocks_1.mkText("function " + name + "() "),
                compileStatements(e, stmts)
            ];
        }
        function compileProcedureCall(e, b, comments) {
            var name = escapeVarName(b.getFieldValue("NAME"), e, true);
            return blocks_1.mkStmt(blocks_1.mkText(name + "()"));
        }
        function compileFunctionCall(e, b, comments, statement) {
            var name = escapeVarName(b.getField("function_name").getText(), e, true);
            var externalInputs = !b.getInputsInline();
            var args = b.getArguments().map(function (a) {
                return {
                    actualName: a.name,
                    definitionName: a.id
                };
            });
            var compiledArgs = args.map(function (a) { return compileArgument(e, b, a, comments); });
            var res = blocks_1.H.stdCall(name, compiledArgs, externalInputs);
            if (statement) {
                return blocks_1.mkStmt(res);
            }
            return res;
        }
        function compileReturnStatement(e, b, comments) {
            var expression = getInputTargetBlock(b, "RETURN_VALUE");
            if (expression && expression.type != "placeholder") {
                return blocks_1.mkStmt(blocks_1.mkText("return "), compileExpression(e, expression, comments));
            }
            else {
                return blocks_1.mkStmt(blocks_1.mkText("return"));
            }
        }
        function compileArgumentReporter(e, b, comments) {
            var name = escapeVarName(b.getFieldValue("VALUE"), e);
            return blocks_1.mkText(name);
        }
        function compileWorkspaceComment(c) {
            var content = c.getContent();
            return blocks_1.Helpers.mkMultiComment(content.trim());
        }
        function defaultValueForType(t) {
            if (t.type == null) {
                union(t, ground(pNumber.type));
                t = find(t);
            }
            if (isArrayType(t.type) || t.isArrayType) {
                return blocks_1.mkText("[]");
            }
            switch (t.type) {
                case "boolean":
                    return blocks_1.H.mkBooleanLiteral(false);
                case "number":
                    return blocks_1.H.mkNumberLiteral(0);
                case "string":
                    return blocks_1.H.mkStringLiteral("");
                default:
                    return blocks_1.mkText("null");
            }
        }
        // [t] is the expected type; we assume that we never null block children
        // (because placeholder blocks have been inserted by the type-checking phase
        // whenever a block was actually missing).
        function compileExpression(e, b, comments) {
            assert(b != null);
            e.stats[b.type] = (e.stats[b.type] || 0) + 1;
            maybeAddComment(b, comments);
            var expr;
            if (b.type == "placeholder" || !(b.isEnabled && b.isEnabled())) {
                var ret = find(returnType(e, b));
                if (ret.type === "Array") {
                    // FIXME: Can't use default type here because TS complains about
                    // the array having an implicit any type. However, forcing this
                    // to be a number array may cause type issues. Also, potential semicolon
                    // issues if we ever have a block where the array is not the first argument...
                    var isExpression = b.parentBlock_.type === "lists_index_get";
                    if (!isExpression) {
                        var call = e.stdCallTable[b.parentBlock_.type];
                        isExpression = call && call.isExpression;
                    }
                    var arrayNode = blocks_1.mkText("[0]");
                    expr = isExpression ? arrayNode : prefixWithSemicolon(arrayNode);
                }
                else {
                    expr = defaultValueForType(returnType(e, b));
                }
            }
            else
                switch (b.type) {
                    case "math_number":
                    case "math_integer":
                    case "math_whole_number":
                        expr = compileNumber(e, b, comments);
                        break;
                    case "math_number_minmax":
                        expr = compileNumber(e, b, comments);
                        break;
                    case "math_op2":
                        expr = compileMathOp2(e, b, comments);
                        break;
                    case "math_op3":
                        expr = compileMathOp3(e, b, comments);
                        break;
                    case "math_arithmetic":
                    case "logic_compare":
                    case "logic_operation":
                        expr = compileArithmetic(e, b, comments);
                        break;
                    case "math_modulo":
                        expr = compileModulo(e, b, comments);
                        break;
                    case "logic_boolean":
                        expr = compileBoolean(e, b, comments);
                        break;
                    case "logic_negate":
                        expr = compileNot(e, b, comments);
                        break;
                    case "variables_get":
                        expr = compileVariableGet(e, b);
                        break;
                    case "text":
                        expr = compileText(e, b, comments);
                        break;
                    case "text_join":
                        expr = compileTextJoin(e, b, comments);
                        break;
                    case "lists_create_with":
                        expr = compileCreateList(e, b, comments);
                        break;
                    case "lists_index_get":
                        expr = compileListGet(e, b, comments);
                        break;
                    case "lists_index_set":
                        expr = compileListSet(e, b, comments);
                        break;
                    case "math_js_op":
                    case "math_js_round":
                        expr = compileMathJsOp(e, b, comments);
                        break;
                    case pxtc.TS_OUTPUT_TYPE:
                        expr = extractTsExpression(e, b, comments);
                        break;
                    case "argument_reporter_boolean":
                    case "argument_reporter_number":
                    case "argument_reporter_string":
                    case "argument_reporter_custom":
                        expr = compileArgumentReporter(e, b, comments);
                        break;
                    case "function_call_output":
                        expr = compileFunctionCall(e, b, comments, false);
                        break;
                    default:
                        var call = e.stdCallTable[b.type];
                        if (call) {
                            if (call.imageLiteral)
                                expr = compileImage(e, b, call.imageLiteral, call.imageLiteralColumns, call.imageLiteralRows, call.namespace, call.f, visibleParams(call, countOptionals(b)).map(function (ar) { return compileArgument(e, b, ar, comments); }));
                            else
                                expr = compileStdCall(e, b, call, comments);
                        }
                        else {
                            pxt.reportError("blocks", "unable to compile expression", { "details": b.type });
                            expr = defaultValueForType(returnType(e, b));
                        }
                        break;
                }
            expr.id = b.id;
            return expr;
        }
        blocks_1.compileExpression = compileExpression;
        function lookup(e, b, name) {
            return getVarInfo(name, e.idToScope[b.id]);
        }
        function emptyEnv(w, options) {
            return {
                workspace: w,
                options: options,
                stdCallTable: {},
                userFunctionReturnValues: {},
                diagnostics: [],
                errors: [],
                renames: {
                    oldToNew: {},
                    takenNames: {},
                    oldToNewFunctions: {}
                },
                stats: {},
                enums: [],
                kinds: [],
                idToScope: {},
                blockDeclarations: {},
                allVariables: [],
                blocksInfo: null
            };
        }
        ;
        ///////////////////////////////////////////////////////////////////////////////
        // Statements
        ///////////////////////////////////////////////////////////////////////////////
        function compileControlsIf(e, b, comments) {
            var stmts = [];
            // Notice the <= (if there's no else-if, we still compile the primary if).
            for (var i = 0; i <= b.elseifCount_; ++i) {
                var cond = compileExpression(e, getInputTargetBlock(b, "IF" + i), comments);
                var thenBranch = compileStatements(e, getInputTargetBlock(b, "DO" + i));
                var startNode = blocks_1.mkText("if (");
                if (i > 0) {
                    startNode = blocks_1.mkText("else if (");
                    startNode.glueToBlock = blocks_1.GlueMode.WithSpace;
                }
                append(stmts, [
                    startNode,
                    cond,
                    blocks_1.mkText(")"),
                    thenBranch
                ]);
            }
            if (b.elseCount_) {
                var elseNode = blocks_1.mkText("else");
                elseNode.glueToBlock = blocks_1.GlueMode.WithSpace;
                append(stmts, [
                    elseNode,
                    compileStatements(e, getInputTargetBlock(b, "ELSE"))
                ]);
            }
            return stmts;
        }
        function compileControlsFor(e, b, comments) {
            var bTo = getInputTargetBlock(b, "TO");
            var bDo = getInputTargetBlock(b, "DO");
            var bBy = getInputTargetBlock(b, "BY");
            var bFrom = getInputTargetBlock(b, "FROM");
            var incOne = !bBy || (bBy.type.match(/^math_number/) && extractNumber(bBy) == 1);
            var binding = lookup(e, b, getLoopVariableField(b).getField("VAR").getText());
            return [
                blocks_1.mkText("for (let " + binding.escapedName + " = "),
                bFrom ? compileExpression(e, bFrom, comments) : blocks_1.mkText("0"),
                blocks_1.mkText("; "),
                blocks_1.mkInfix(blocks_1.mkText(binding.escapedName), "<=", compileExpression(e, bTo, comments)),
                blocks_1.mkText("; "),
                incOne ? blocks_1.mkText(binding.escapedName + "++") : blocks_1.mkInfix(blocks_1.mkText(binding.escapedName), "+=", compileExpression(e, bBy, comments)),
                blocks_1.mkText(")"),
                compileStatements(e, bDo)
            ];
        }
        function compileControlsRepeat(e, b, comments) {
            var bound = compileExpression(e, getInputTargetBlock(b, "TIMES"), comments);
            var body = compileStatements(e, getInputTargetBlock(b, "DO"));
            var valid = function (x) { return !lookup(e, b, x); };
            var name = "index";
            // Start at 2 because index0 and index1 are bad names
            for (var i = 2; !valid(name); i++)
                name = "index" + i;
            return [
                blocks_1.mkText("for (let " + name + " = 0; "),
                blocks_1.mkInfix(blocks_1.mkText(name), "<", bound),
                blocks_1.mkText("; " + name + "++)"),
                body
            ];
        }
        function compileWhile(e, b, comments) {
            var cond = compileExpression(e, getInputTargetBlock(b, "COND"), comments);
            var body = compileStatements(e, getInputTargetBlock(b, "DO"));
            return [
                blocks_1.mkText("while ("),
                cond,
                blocks_1.mkText(")"),
                body
            ];
        }
        function compileControlsForOf(e, b, comments) {
            var bOf = getInputTargetBlock(b, "LIST");
            var bDo = getInputTargetBlock(b, "DO");
            var binding = lookup(e, b, getLoopVariableField(b).getField("VAR").getText());
            return [
                blocks_1.mkText("for (let " + binding.escapedName + " of "),
                compileExpression(e, bOf, comments),
                blocks_1.mkText(")"),
                compileStatements(e, bDo)
            ];
        }
        function compileForever(e, b) {
            var bBody = getInputTargetBlock(b, "HANDLER");
            var body = compileStatements(e, bBody);
            return mkCallWithCallback(e, "basic", "forever", [], body);
        }
        // convert to javascript friendly name
        function escapeVarName(name, e, isFunction) {
            if (isFunction === void 0) { isFunction = false; }
            if (!name)
                return '_';
            if (isFunction) {
                if (e.renames.oldToNewFunctions[name]) {
                    return e.renames.oldToNewFunctions[name];
                }
            }
            else if (e.renames.oldToNew[name]) {
                return e.renames.oldToNew[name];
            }
            var n = ts.pxtc.escapeIdentifier(name);
            if (e.renames.takenNames[n]) {
                var i = 2;
                while (e.renames.takenNames[n + i]) {
                    i++;
                }
                n += i;
            }
            if (isFunction) {
                e.renames.oldToNewFunctions[name] = n;
                e.renames.takenNames[n] = true;
            }
            else {
                e.renames.oldToNew[name] = n;
            }
            return n;
        }
        blocks_1.escapeVarName = escapeVarName;
        function compileVariableGet(e, b) {
            var name = b.getField("VAR").getText();
            var binding = lookup(e, b, name);
            if (!binding) // trying to compile a disabled block with a bogus variable
                return blocks_1.mkText(name);
            if (!binding.firstReference)
                binding.firstReference = b;
            assert(binding != null && binding.type != null);
            return blocks_1.mkText(binding.escapedName);
        }
        function compileSet(e, b, comments) {
            var bExpr = getInputTargetBlock(b, "VALUE");
            var binding = lookup(e, b, b.getField("VAR").getText());
            var currentScope = e.idToScope[b.id];
            var isDef = currentScope.declaredVars[binding.name] === binding && !binding.firstReference && !binding.alreadyDeclared;
            if (isDef) {
                // Check the expression of the set block to determine if it references itself and needs
                // to be hoisted
                forEachChildExpression(b, function (child) {
                    if (child.type === "variables_get") {
                        var childBinding = lookup(e, child, child.getField("VAR").getText());
                        if (childBinding === binding)
                            isDef = false;
                    }
                }, true);
            }
            var expr = compileExpression(e, bExpr, comments);
            var bindString = binding.escapedName + " = ";
            binding.isAssigned = true;
            if (isDef) {
                binding.alreadyDeclared = BlockDeclarationType.Assigned;
                var declaredType = getConcreteType(binding.type);
                bindString = "let " + binding.escapedName + " = ";
                if (declaredType) {
                    var expressionType = getConcreteType(returnType(e, bExpr));
                    if (declaredType.type !== expressionType.type) {
                        bindString = "let " + binding.escapedName + ": " + declaredType.type + " = ";
                    }
                }
            }
            else if (!binding.firstReference) {
                binding.firstReference = b;
            }
            return blocks_1.mkStmt(blocks_1.mkText(bindString), expr);
        }
        function compileChange(e, b, comments) {
            var bExpr = getInputTargetBlock(b, "VALUE");
            var binding = lookup(e, b, b.getField("VAR").getText());
            var expr = compileExpression(e, bExpr, comments);
            var ref = blocks_1.mkText(binding.escapedName);
            return blocks_1.mkStmt(blocks_1.mkInfix(ref, "+=", expr));
        }
        function eventArgs(call, b) {
            return visibleParams(call, countOptionals(b)).filter(function (ar) { return !!ar.definitionName; });
        }
        function compileCall(e, b, comments) {
            var call = e.stdCallTable[b.type];
            if (call.imageLiteral)
                return blocks_1.mkStmt(compileImage(e, b, call.imageLiteral, call.imageLiteralColumns, call.imageLiteralRows, call.namespace, call.f, visibleParams(call, countOptionals(b)).map(function (ar) { return compileArgument(e, b, ar, comments); })));
            else if (call.hasHandler)
                return compileEvent(e, b, call, eventArgs(call, b), call.namespace, comments);
            else
                return blocks_1.mkStmt(compileStdCall(e, b, call, comments));
        }
        function compileArgument(e, b, p, comments, beginningOfStatement) {
            if (beginningOfStatement === void 0) { beginningOfStatement = false; }
            var f = b.getFieldValue(p.definitionName);
            if (f != null) {
                var field = b.getField(p.definitionName);
                if (field instanceof pxtblockly.FieldTextInput) {
                    return blocks_1.H.mkStringLiteral(f);
                }
                else if (field instanceof pxtblockly.FieldTilemap) {
                    var project = pxt.react.getTilemapProject();
                    var tmString = field.getValue();
                    if (tmString.startsWith("tilemap`")) {
                        return blocks_1.mkText(tmString);
                    }
                    if (e.options.emitTilemapLiterals) {
                        try {
                            var data = pxt.sprite.decodeTilemap(tmString, "typescript", project);
                            if (data) {
                                var name_1 = project.createNewTilemapFromData(data)[0];
                                return blocks_1.mkText("tilemap`" + name_1 + "`");
                            }
                        }
                        catch (e) {
                            // This is a legacy tilemap or a grey block, ignore the exception
                            // and compile as a normal field
                        }
                    }
                }
                // For some enums in pxt-minecraft, we emit the members as constants that are defined in
                // libs/core. For example, Blocks.GoldBlock is emitted as GOLD_BLOCK
                var type = e.blocksInfo.apis.byQName[p.type];
                if (type && type.attributes.emitAsConstant) {
                    for (var _i = 0, _a = Object.keys(e.blocksInfo.apis.byQName); _i < _a.length; _i++) {
                        var symbolName = _a[_i];
                        var symbol = e.blocksInfo.apis.byQName[symbolName];
                        if (symbol && symbol.attributes && symbol.attributes.enumIdentity === f) {
                            return blocks_1.mkText(symbolName);
                        }
                    }
                }
                var text = blocks_1.mkText(f);
                text.canIndentInside = typeof f == "string" && f.indexOf('\n') >= 0;
                return text;
            }
            else {
                attachPlaceholderIf(e, b, p.definitionName);
                var target = getInputTargetBlock(b, p.definitionName);
                if (beginningOfStatement && target.type === "lists_create_with") {
                    // We have to be careful of array literals at the beginning of a statement
                    // because they can cause errors (i.e. they get parsed as an index). Add a
                    // semicolon to the previous statement just in case.
                    // FIXME: No need to do this if the previous statement was a code block
                    return prefixWithSemicolon(compileExpression(e, target, comments));
                }
                if (p.shadowOptions && p.shadowOptions.toString && returnType(e, target) !== pString) {
                    return blocks_1.H.mkSimpleCall("+", [blocks_1.H.mkStringLiteral(""), blocks_1.H.mkParenthesizedExpression(compileExpression(e, target, comments))]);
                }
                return compileExpression(e, target, comments);
            }
        }
        function compileStdCall(e, b, func, comments) {
            var args;
            if (isMutatingBlock(b) && b.mutation.getMutationType() === blocks_1.MutatorTypes.RestParameterMutator) {
                args = b.mutation.compileMutation(e, comments).children;
            }
            else if (func.attrs.shim === "ENUM_GET") {
                var enumName = func.attrs.enumName;
                var enumMember = b.getFieldValue("MEMBER").replace(/^\d+/, "");
                return blocks_1.H.mkPropertyAccess(enumMember, blocks_1.mkText(enumName));
            }
            else if (func.attrs.shim === "KIND_GET") {
                var info = e.kinds.filter(function (k) { return k.blockId === func.attrs.blockId; })[0];
                return blocks_1.H.mkPropertyAccess(b.getFieldValue("MEMBER"), blocks_1.mkText(info.name));
            }
            else {
                args = visibleParams(func, countOptionals(b)).map(function (p, i) { return compileArgument(e, b, p, comments, func.isExtensionMethod && i === 0 && !func.isExpression); });
            }
            var callNamespace = func.namespace;
            var callName = func.f;
            if (func.attrs.blockAliasFor) {
                var aliased = e.blocksInfo.apis.byQName[func.attrs.blockAliasFor];
                if (aliased) {
                    callName = aliased.name;
                    callNamespace = aliased.namespace;
                }
            }
            var externalInputs = !b.getInputsInline();
            if (func.isIdentity)
                return args[0];
            else if (func.property) {
                return blocks_1.H.mkPropertyAccess(callName, args[0]);
            }
            else if (callName == "@get@") {
                return blocks_1.H.mkPropertyAccess(args[1].op.replace(/.*\./, ""), args[0]);
            }
            else if (callName == "@set@") {
                return blocks_1.H.mkAssign(blocks_1.H.mkPropertyAccess(args[1].op.replace(/.*\./, "").replace(/@set/, ""), args[0]), args[2]);
            }
            else if (callName == "@change@") {
                return blocks_1.H.mkSimpleCall("+=", [blocks_1.H.mkPropertyAccess(args[1].op.replace(/.*\./, "").replace(/@set/, ""), args[0]), args[2]]);
            }
            else if (func.isExtensionMethod) {
                if (func.attrs.defaultInstance) {
                    var instance = void 0;
                    if (isMutatingBlock(b) && b.mutation.getMutationType() === blocks_1.MutatorTypes.DefaultInstanceMutator) {
                        instance = b.mutation.compileMutation(e, comments);
                    }
                    if (instance) {
                        args.unshift(instance);
                    }
                    else {
                        args.unshift(blocks_1.mkText(func.attrs.defaultInstance));
                    }
                }
                return blocks_1.H.extensionCall(callName, args, externalInputs);
            }
            else if (callNamespace) {
                return blocks_1.H.namespaceCall(callNamespace, callName, args, externalInputs);
            }
            else {
                return blocks_1.H.stdCall(callName, args, externalInputs);
            }
        }
        function compileStdBlock(e, b, f, comments) {
            return blocks_1.mkStmt(compileStdCall(e, b, f, comments));
        }
        function mkCallWithCallback(e, n, f, args, body, argumentDeclaration, isExtension) {
            if (isExtension === void 0) { isExtension = false; }
            body.noFinalNewline = true;
            var callback;
            if (argumentDeclaration) {
                callback = blocks_1.mkGroup([argumentDeclaration, body]);
            }
            else {
                callback = blocks_1.mkGroup([blocks_1.mkText("function ()"), body]);
            }
            if (isExtension)
                return blocks_1.mkStmt(blocks_1.H.extensionCall(f, args.concat([callback]), false));
            else if (n)
                return blocks_1.mkStmt(blocks_1.H.namespaceCall(n, f, args.concat([callback]), false));
            else
                return blocks_1.mkStmt(blocks_1.H.mkCall(f, args.concat([callback]), false));
        }
        function compileStartEvent(e, b) {
            var bBody = getInputTargetBlock(b, "HANDLER");
            var body = compileStatements(e, bBody);
            if (pxt.appTarget.compile && pxt.appTarget.compile.onStartText && body && body.children) {
                body.children.unshift(blocks_1.mkStmt(blocks_1.mkText("// " + pxtc.ON_START_COMMENT + "\n")));
            }
            return body;
        }
        function compileEvent(e, b, stdfun, args, ns, comments) {
            var compiledArgs = args.map(function (arg) { return compileArgument(e, b, arg, comments); });
            var bBody = getInputTargetBlock(b, "HANDLER");
            var body = compileStatements(e, bBody);
            if (pxt.appTarget.compile && pxt.appTarget.compile.emptyEventHandlerComments && body.children.length === 0) {
                body.children.unshift(blocks_1.mkStmt(blocks_1.mkText("// " + pxtc.HANDLER_COMMENT)));
            }
            var argumentDeclaration;
            if (isMutatingBlock(b) && b.mutation.getMutationType() === blocks_1.MutatorTypes.ObjectDestructuringMutator) {
                argumentDeclaration = b.mutation.compileMutation(e, comments);
            }
            else if (stdfun.comp.handlerArgs.length) {
                var handlerArgs = getEscapedCBParameters(b, stdfun, e);
                argumentDeclaration = blocks_1.mkText("function (" + handlerArgs.join(", ") + ")");
            }
            return mkCallWithCallback(e, ns, stdfun.f, compiledArgs, body, argumentDeclaration, stdfun.isExtensionMethod);
        }
        function isMutatingBlock(b) {
            return !!b.mutation;
        }
        function compileImage(e, b, frames, columns, rows, n, f, args) {
            args = args === undefined ? [] : args;
            var state = "\n";
            rows = rows || 5;
            columns = (columns || 5) * frames;
            var leds = b.getFieldValue("LEDS");
            leds = leds.replace(/[ `\n]+/g, '');
            for (var i = 0; i < rows; ++i) {
                for (var j = 0; j < columns; ++j) {
                    if (j > 0)
                        state += ' ';
                    state += (leds[(i * columns) + j] === '#') ? "#" : ".";
                }
                state += '\n';
            }
            var lit = blocks_1.H.mkStringLiteral(state);
            lit.canIndentInside = true;
            return blocks_1.H.namespaceCall(n, f, [lit].concat(args), false);
        }
        function compileStatementBlock(e, b) {
            var r;
            var comments = [];
            e.stats[b.type] = (e.stats[b.type] || 0) + 1;
            maybeAddComment(b, comments);
            switch (b.type) {
                case 'controls_if':
                    r = compileControlsIf(e, b, comments);
                    break;
                case 'pxt_controls_for':
                case 'controls_for':
                case 'controls_simple_for':
                    r = compileControlsFor(e, b, comments);
                    break;
                case 'pxt_controls_for_of':
                case 'controls_for_of':
                    r = compileControlsForOf(e, b, comments);
                    break;
                case 'variables_set':
                    r = [compileSet(e, b, comments)];
                    break;
                case 'variables_change':
                    r = [compileChange(e, b, comments)];
                    break;
                case 'controls_repeat_ext':
                    r = compileControlsRepeat(e, b, comments);
                    break;
                case 'device_while':
                    r = compileWhile(e, b, comments);
                    break;
                case 'procedures_defnoreturn':
                    r = compileProcedure(e, b, comments);
                    break;
                case 'function_definition':
                    r = compileFunctionDefinition(e, b, comments);
                    break;
                case 'procedures_callnoreturn':
                    r = [compileProcedureCall(e, b, comments)];
                    break;
                case 'function_call':
                    r = [compileFunctionCall(e, b, comments, true)];
                    break;
                case pxtc.TS_RETURN_STATEMENT_TYPE:
                    r = [compileReturnStatement(e, b, comments)];
                    break;
                case ts.pxtc.ON_START_TYPE:
                    r = compileStartEvent(e, b).children;
                    break;
                case pxtc.TS_STATEMENT_TYPE:
                    r = compileTypescriptBlock(e, b);
                    break;
                case pxtc.PAUSE_UNTIL_TYPE:
                    r = compilePauseUntilBlock(e, b, comments);
                    break;
                case pxtc.TS_DEBUGGER_TYPE:
                    r = compileDebuggeStatementBlock(e, b);
                    break;
                case pxtc.TS_BREAK_TYPE:
                    r = compileBreakStatementBlock(e, b);
                    break;
                case pxtc.TS_CONTINUE_TYPE:
                    r = compileContinueStatementBlock(e, b);
                    break;
                default:
                    var call = e.stdCallTable[b.type];
                    if (call)
                        r = [compileCall(e, b, comments)];
                    else
                        r = [blocks_1.mkStmt(compileExpression(e, b, comments))];
                    break;
            }
            var l = r[r.length - 1];
            if (l && !l.id)
                l.id = b.id;
            if (comments.length) {
                addCommentNodes(comments, r);
            }
            r.forEach(function (l) {
                if ((l.type === blocks_1.NT.Block || l.type === blocks_1.NT.Prefix && pxt.Util.startsWith(l.op, "//")) && (b.type != pxtc.ON_START_TYPE || !l.id)) {
                    l.id = b.id;
                }
            });
            return r;
        }
        function compileStatements(e, b) {
            var stmts = [];
            var firstBlock = b;
            while (b) {
                if (b.isEnabled())
                    append(stmts, compileStatementBlock(e, b));
                b = b.getNextBlock();
            }
            if (firstBlock && e.blockDeclarations[firstBlock.id]) {
                e.blockDeclarations[firstBlock.id].filter(function (v) { return !v.alreadyDeclared; }).forEach(function (varInfo) {
                    stmts.unshift(mkVariableDeclaration(varInfo, e.blocksInfo));
                    varInfo.alreadyDeclared = BlockDeclarationType.Implicit;
                });
            }
            return blocks_1.mkBlock(stmts);
        }
        function compileTypescriptBlock(e, b) {
            return b.getLines().map(function (line) { return blocks_1.mkText(line + "\n"); });
        }
        function compileDebuggeStatementBlock(e, b) {
            if (b.getFieldValue("ON_OFF") == "1") {
                return [
                    blocks_1.mkText("debugger;\n")
                ];
            }
            return [];
        }
        function compileBreakStatementBlock(e, b) {
            return [blocks_1.mkText("break;\n")];
        }
        function compileContinueStatementBlock(e, b) {
            return [blocks_1.mkText("continue;\n")];
        }
        function prefixWithSemicolon(n) {
            var emptyStatement = blocks_1.mkStmt(blocks_1.mkText(";"));
            emptyStatement.glueToBlock = blocks_1.GlueMode.NoSpace;
            return blocks_1.mkGroup([emptyStatement, n]);
        }
        function compilePauseUntilBlock(e, b, comments) {
            var options = pxt.appTarget.runtime && pxt.appTarget.runtime.pauseUntilBlock;
            pxt.Util.assert(!!options, "target has block enabled");
            var ns = options.namespace;
            var name = options.callName || "pauseUntil";
            var arg = compileArgument(e, b, { definitionName: "PREDICATE", actualName: "PREDICATE" }, comments);
            var lambda = [blocks_1.mkGroup([blocks_1.mkText("() => "), arg])];
            if (ns) {
                return [blocks_1.mkStmt(blocks_1.H.namespaceCall(ns, name, lambda, false))];
            }
            else {
                return [blocks_1.mkStmt(blocks_1.H.mkCall(name, lambda, false, false))];
            }
        }
        // This function creates an empty environment where type inference has NOT yet
        // been performed.
        // - All variables have been assigned an initial [Point] in the union-find.
        // - Variables have been marked to indicate if they are compatible with the
        //   TouchDevelop for-loop model.
        function mkEnv(w, blockInfo, options) {
            if (options === void 0) { options = {}; }
            // The to-be-returned environment.
            var e = emptyEnv(w, options);
            e.blocksInfo = blockInfo;
            // append functions in stdcalltable
            if (blockInfo) {
                // Enums, tagged templates, and namespaces are not enclosed in namespaces,
                // so add them to the taken names to avoid collision
                Object.keys(blockInfo.apis.byQName).forEach(function (name) {
                    var info = blockInfo.apis.byQName[name];
                    // Note: the check for info.pkg filters out functions defined in the user's project.
                    // Otherwise, after the first compile the function will be renamed because it conflicts
                    // with itself. You can still get collisions if you attempt to define a function with
                    // the same name as a function defined in another file in the user's project (e.g. custom.ts)
                    if (info.pkg && (info.kind === 6 /* Enum */ || info.kind === 3 /* Function */ || info.kind === 5 /* Module */ || info.kind === 4 /* Variable */)) {
                        e.renames.takenNames[info.qName] = true;
                    }
                });
                if (blockInfo.enumsByName) {
                    Object.keys(blockInfo.enumsByName).forEach(function (k) { return e.enums.push(blockInfo.enumsByName[k]); });
                }
                if (blockInfo.kindsByName) {
                    Object.keys(blockInfo.kindsByName).forEach(function (k) { return e.kinds.push(blockInfo.kindsByName[k]); });
                }
                blockInfo.blocks
                    .forEach(function (fn) {
                    if (e.stdCallTable[fn.attributes.blockId]) {
                        pxt.reportError("blocks", "function already defined", {
                            "details": fn.attributes.blockId,
                            "qualifiedName": fn.qName,
                            "packageName": fn.pkg,
                        });
                        return;
                    }
                    e.renames.takenNames[fn.namespace] = true;
                    var comp = pxt.blocks.compileInfo(fn);
                    var instance = !!comp.thisParameter;
                    e.stdCallTable[fn.attributes.blockId] = {
                        namespace: fn.namespace,
                        f: fn.name,
                        comp: comp,
                        attrs: fn.attributes,
                        isExtensionMethod: instance,
                        isExpression: fn.retType && fn.retType !== "void",
                        imageLiteral: fn.attributes.imageLiteral,
                        imageLiteralColumns: fn.attributes.imageLiteralColumns,
                        imageLiteralRows: fn.attributes.imageLiteralRows,
                        hasHandler: pxt.blocks.hasHandler(fn),
                        property: !fn.parameters,
                        isIdentity: fn.attributes.shim == "TD_ID"
                    };
                });
                w.getTopBlocks(false).filter(isFunctionDefinition).forEach(function (b) {
                    // Add functions to the rename map to prevent name collisions with variables
                    var name = b.type === "procedures_defnoreturn" ? b.getFieldValue("NAME") : b.getField("function_name").getText();
                    escapeVarName(name, e, true);
                });
            }
            return e;
        }
        blocks_1.mkEnv = mkEnv;
        function compileBlockAsync(b, blockInfo) {
            var w = b.workspace;
            var e = mkEnv(w, blockInfo);
            infer(w && w.getAllBlocks(), e, w);
            var compiled = compileStatementBlock(e, b);
            removeAllPlaceholders();
            return tdASTtoTS(e, compiled);
        }
        blocks_1.compileBlockAsync = compileBlockAsync;
        function eventWeight(b, e) {
            if (b.type === ts.pxtc.ON_START_TYPE) {
                return 0;
            }
            var api = e.stdCallTable[b.type];
            var key = callKey(e, b);
            var hash = 1 + ts.pxtc.Util.codalHash16(key);
            if (api && api.attrs.afterOnStart)
                return hash;
            else
                return -hash;
        }
        function compileWorkspace(e, w, blockInfo) {
            try {
                // all compiled top level blocks are events
                var allBlocks = w.getAllBlocks();
                // the top blocks are storted by blockly
                var topblocks = w.getTopBlocks(true);
                // reorder remaining events by names (top blocks still contains disabled blocks)
                topblocks = topblocks.sort(function (a, b) {
                    return eventWeight(a, e) - eventWeight(b, e);
                });
                // update disable blocks
                updateDisabledBlocks(e, allBlocks, topblocks);
                // drop disabled blocks
                allBlocks = allBlocks.filter(function (b) { return b.isEnabled(); });
                topblocks = topblocks.filter(function (b) { return b.isEnabled(); });
                trackAllVariables(topblocks, e);
                infer(allBlocks, e, w);
                var stmtsMain_1 = [];
                // compile workspace comments, add them to the top
                var topComments = w.getTopComments(true);
                var commentMap_1 = groupWorkspaceComments(topblocks, topComments);
                commentMap_1.orphans.forEach(function (comment) { return append(stmtsMain_1, compileWorkspaceComment(comment).children); });
                topblocks.forEach(function (b) {
                    if (commentMap_1.idToComments[b.id]) {
                        commentMap_1.idToComments[b.id].forEach(function (comment) {
                            append(stmtsMain_1, compileWorkspaceComment(comment).children);
                        });
                    }
                    if (b.type == ts.pxtc.ON_START_TYPE)
                        append(stmtsMain_1, compileStatementBlock(e, b));
                    else {
                        var compiled = blocks_1.mkBlock(compileStatementBlock(e, b));
                        if (compiled.type == blocks_1.NT.Block)
                            append(stmtsMain_1, compiled.children);
                        else
                            stmtsMain_1.push(compiled);
                    }
                });
                var stmtsEnums_1 = [];
                e.enums.forEach(function (info) {
                    var models = w.getVariablesOfType(info.name);
                    if (models && models.length) {
                        var members = models.map(function (m) {
                            var match = /^(\d+)([^0-9].*)$/.exec(m.name);
                            if (match) {
                                return [match[2], parseInt(match[1])];
                            }
                            else {
                                // Someone has been messing with the XML...
                                return [m.name, -1];
                            }
                        });
                        members.sort(function (a, b) { return a[1] - b[1]; });
                        var nodes_1 = [];
                        var lastValue_1 = -1;
                        members.forEach(function (_a, index) {
                            var name = _a[0], value = _a[1];
                            var newNode;
                            if (info.isBitMask) {
                                var shift = Math.log2(value);
                                if (shift >= 0 && Math.floor(shift) === shift) {
                                    newNode = blocks_1.H.mkAssign(blocks_1.mkText(name), blocks_1.H.mkSimpleCall("<<", [blocks_1.H.mkNumberLiteral(1), blocks_1.H.mkNumberLiteral(shift)]));
                                }
                            }
                            else if (info.isHash) {
                                var hash = ts.pxtc.Util.codalHash16(name.toLowerCase());
                                newNode = blocks_1.H.mkAssign(blocks_1.mkText(name), blocks_1.H.mkNumberLiteral(hash));
                            }
                            if (!newNode) {
                                if (value === lastValue_1 + 1) {
                                    newNode = blocks_1.mkText(name);
                                }
                                else {
                                    newNode = blocks_1.H.mkAssign(blocks_1.mkText(name), blocks_1.H.mkNumberLiteral(value));
                                }
                            }
                            nodes_1.push(newNode);
                            lastValue_1 = value;
                        });
                        var declarations = blocks_1.mkCommaSep(nodes_1, true);
                        declarations.glueToBlock = blocks_1.GlueMode.NoSpace;
                        stmtsEnums_1.push(blocks_1.mkGroup([
                            blocks_1.mkText("enum " + info.name),
                            blocks_1.mkBlock([declarations])
                        ]));
                    }
                });
                e.kinds.forEach(function (info) {
                    var models = w.getVariablesOfType("KIND_" + info.name);
                    if (models && models.length) {
                        var userDefined = models.map(function (m) { return m.name; }).filter(function (n) { return info.initialMembers.indexOf(n) === -1; });
                        if (userDefined.length) {
                            stmtsEnums_1.push(blocks_1.mkGroup([
                                blocks_1.mkText("namespace " + info.name),
                                blocks_1.mkBlock(userDefined.map(function (varName) { return blocks_1.mkStmt(blocks_1.mkText("export const " + varName + " = " + info.name + "." + info.createFunctionName + "()")); }))
                            ]));
                        }
                    }
                });
                var leftoverVars = e.allVariables.filter(function (v) { return !v.alreadyDeclared; }).map(function (v) { return mkVariableDeclaration(v, blockInfo); });
                e.allVariables.filter(function (v) { return v.alreadyDeclared === BlockDeclarationType.Implicit && !v.isAssigned; }).forEach(function (v) {
                    var t = getConcreteType(v.type);
                    // The primitive types all get initializers set to default values, other types are set to null
                    if (t.type === "string" || t.type === "number" || t.type === "boolean" || isArrayType(t.type))
                        return;
                    e.diagnostics.push({
                        blockId: v.firstReference && v.firstReference.id,
                        message: lf("Variable '{0}' is never assigned", v.name)
                    });
                });
                return [stmtsEnums_1.concat(leftoverVars.concat(stmtsMain_1)), e.diagnostics];
            }
            catch (err) {
                var be = err.block;
                if (be) {
                    be.setWarningText(err + "");
                    e.errors.push(be);
                }
                else {
                    throw err;
                }
            }
            finally {
                removeAllPlaceholders();
            }
            return [null, null]; // unreachable
        }
        function callKey(e, b) {
            if (b.type == ts.pxtc.ON_START_TYPE)
                return JSON.stringify({ name: ts.pxtc.ON_START_TYPE });
            else if (b.type == ts.pxtc.FUNCTION_DEFINITION_TYPE)
                return JSON.stringify({ type: "function", name: b.getFieldValue("function_name") });
            var key = JSON.stringify(blockKey(b))
                .replace(/"id"\s*:\s*"[^"]+"/g, ''); // remove blockly ids
            return key;
        }
        blocks_1.callKey = callKey;
        function blockKey(b) {
            var fields = [];
            var inputs = [];
            for (var _i = 0, _a = b.inputList; _i < _a.length; _i++) {
                var input = _a[_i];
                for (var _b = 0, _c = input.fieldRow; _b < _c.length; _b++) {
                    var field = _c[_b];
                    if (field.name) {
                        fields.push(field.getText());
                    }
                }
                if (input.type === Blockly.INPUT_VALUE) {
                    if (input.connection.targetBlock()) {
                        inputs.push(blockKey(input.connection.targetBlock()));
                    }
                    else {
                        inputs.push(null);
                    }
                }
            }
            return {
                type: b.type,
                fields: fields,
                inputs: inputs
            };
        }
        function setChildrenEnabled(block, enabled) {
            block.setEnabled(enabled);
            // propagate changes
            var children = block.getDescendants(false);
            for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
                var child = children_1[_i];
                child.setEnabled(enabled);
            }
        }
        function updateDisabledBlocks(e, allBlocks, topBlocks) {
            // unset disabled
            allBlocks.forEach(function (b) { return b.setEnabled(true); });
            // update top blocks
            var events = {};
            function flagDuplicate(key, block) {
                var otherEvent = events[key];
                if (otherEvent) {
                    // another block is already registered
                    setChildrenEnabled(block, false);
                }
                else {
                    setChildrenEnabled(block, true);
                    events[key] = block;
                }
            }
            topBlocks.forEach(function (b) {
                var call = e.stdCallTable[b.type];
                // multiple calls allowed
                if (b.type == ts.pxtc.ON_START_TYPE)
                    flagDuplicate(ts.pxtc.ON_START_TYPE, b);
                else if (isFunctionDefinition(b) || call && call.attrs.blockAllowMultiple && !call.attrs.handlerStatement)
                    return;
                // is this an event?
                else if (call && call.hasHandler && !call.attrs.handlerStatement) {
                    // compute key that identifies event call
                    // detect if same event is registered already
                    var key = call.attrs.blockHandlerKey || callKey(e, b);
                    flagDuplicate(key, b);
                }
                else {
                    // all non-events are disabled
                    var t = b;
                    while (t) {
                        setChildrenEnabled(b, false);
                        t = t.getNextBlock();
                    }
                }
            });
        }
        function findBlockIdByPosition(sourceMap, loc) {
            if (!loc)
                return undefined;
            var bestChunk;
            var bestChunkLength;
            // look for smallest chunk containing the block
            for (var i = 0; i < sourceMap.length; ++i) {
                var chunk = sourceMap[i];
                if (chunk.startPos <= loc.start
                    && chunk.endPos >= loc.start + loc.length
                    && (!bestChunk || bestChunkLength > chunk.endPos - chunk.startPos)) {
                    bestChunk = chunk;
                    bestChunkLength = chunk.endPos - chunk.startPos;
                }
            }
            if (bestChunk) {
                return bestChunk.id;
            }
            return undefined;
        }
        blocks_1.findBlockIdByPosition = findBlockIdByPosition;
        function findBlockIdByLine(sourceMap, loc) {
            if (!loc)
                return undefined;
            var bestChunk;
            var bestChunkLength;
            // look for smallest chunk containing the block
            for (var i = 0; i < sourceMap.length; ++i) {
                var chunk = sourceMap[i];
                if (chunk.startLine <= loc.start
                    && chunk.endLine > loc.start + loc.length
                    && (!bestChunk || bestChunkLength > chunk.endLine - chunk.startLine)) {
                    bestChunk = chunk;
                    bestChunkLength = chunk.endLine - chunk.startLine;
                }
            }
            if (bestChunk) {
                return bestChunk.id;
            }
            return undefined;
        }
        blocks_1.findBlockIdByLine = findBlockIdByLine;
        function compileAsync(b, blockInfo, opts) {
            if (opts === void 0) { opts = {}; }
            var e = mkEnv(b, blockInfo, opts);
            var _a = compileWorkspace(e, b, blockInfo), nodes = _a[0], diags = _a[1];
            var result = tdASTtoTS(e, nodes, diags);
            return result;
        }
        blocks_1.compileAsync = compileAsync;
        function tdASTtoTS(env, app, diags) {
            var res = blocks_1.flattenNode(app);
            // Note: the result of format is not used!
            return workerOpAsync("format", { format: { input: res.output, pos: 1 } }).then(function () {
                return {
                    source: res.output,
                    sourceMap: res.sourceMap,
                    stats: env.stats,
                    diagnostics: diags || []
                };
            });
        }
        function maybeAddComment(b, comments) {
            if (b.comment) {
                if ((typeof b.comment) === "string") {
                    comments.push(b.comment);
                }
                else {
                    comments.push(b.comment.getText());
                }
            }
        }
        function addCommentNodes(comments, r) {
            var commentNodes = [];
            for (var _i = 0, comments_1 = comments; _i < comments_1.length; _i++) {
                var comment = comments_1[_i];
                for (var _a = 0, _b = comment.split("\n"); _a < _b.length; _a++) {
                    var line = _b[_a];
                    commentNodes.push(blocks_1.mkText("// " + line));
                    commentNodes.push(blocks_1.mkNewLine());
                }
            }
            for (var _c = 0, _d = commentNodes.reverse(); _c < _d.length; _c++) {
                var commentNode = _d[_c];
                r.unshift(commentNode);
            }
        }
        function mkVariableDeclaration(v, blockInfo) {
            var t = getConcreteType(v.type);
            var defl;
            if (t.type === "Array") {
                defl = blocks_1.mkText("[]");
            }
            else {
                defl = defaultValueForType(t);
            }
            var tp = "";
            if (defl.op == "null" || defl.op == "[]") {
                var tpname = t.type;
                // If the type is "Array" or null[] it means that we failed to narrow the type of array.
                // Best we can do is just default to number[]
                if (tpname === "Array" || tpname === "null[]") {
                    tpname = "number[]";
                }
                var tpinfo = blockInfo.apis.byQName[tpname];
                if (tpinfo && tpinfo.attributes.autoCreate)
                    defl = blocks_1.mkText(tpinfo.attributes.autoCreate + "()");
                else
                    tp = ": " + tpname;
            }
            return blocks_1.mkStmt(blocks_1.mkText("let " + v.escapedName + tp + " = "), defl);
        }
        function countOptionals(b) {
            if (b.mutationToDom) {
                var el = b.mutationToDom();
                if (el.hasAttribute("_expanded")) {
                    var val = parseInt(el.getAttribute("_expanded"));
                    return isNaN(val) ? 0 : Math.max(val, 0);
                }
            }
            return 0;
        }
        function visibleParams(_a, optionalCount) {
            var comp = _a.comp;
            var res = [];
            if (comp.thisParameter) {
                res.push(comp.thisParameter);
            }
            comp.parameters.forEach(function (p) {
                if (p.isOptional && optionalCount > 0) {
                    res.push(p);
                    --optionalCount;
                }
                else if (!p.isOptional) {
                    res.push(p);
                }
            });
            return res;
        }
        function getEscapedCBParameters(b, stdfun, e) {
            return getCBParameters(b, stdfun).map(function (binding) { return lookup(e, b, binding[0]).escapedName; });
        }
        function getCBParameters(b, stdfun) {
            var handlerArgs = [];
            if (stdfun.attrs.draggableParameters) {
                for (var i = 0; i < stdfun.comp.handlerArgs.length; i++) {
                    var arg = stdfun.comp.handlerArgs[i];
                    var varName = void 0;
                    var varBlock = getInputTargetBlock(b, "HANDLER_DRAG_PARAM_" + arg.name);
                    if (stdfun.attrs.draggableParameters === "reporter") {
                        varName = varBlock && varBlock.getFieldValue("VALUE");
                    }
                    else {
                        varName = varBlock && varBlock.getField("VAR").getText();
                    }
                    if (varName !== null) {
                        handlerArgs.push([varName, mkPoint(arg.type)]);
                    }
                    else {
                        break;
                    }
                }
            }
            else {
                for (var i = 0; i < stdfun.comp.handlerArgs.length; i++) {
                    var arg = stdfun.comp.handlerArgs[i];
                    var varField = b.getField("HANDLER_" + arg.name);
                    var varName = varField && varField.getText();
                    if (varName !== null) {
                        handlerArgs.push([varName, mkPoint(arg.type)]);
                    }
                    else {
                        break;
                    }
                }
            }
            return handlerArgs;
        }
        function groupWorkspaceComments(blocks, comments) {
            if (!blocks.length || blocks.some(function (b) { return !b.rendered; })) {
                return {
                    orphans: comments,
                    idToComments: {}
                };
            }
            var blockBounds = blocks.map(function (block) {
                var bounds = block.getBoundingRectangle();
                var size = block.getHeightWidth();
                return {
                    id: block.id,
                    x: bounds.left,
                    y: bounds.top,
                    width: size.width,
                    height: size.height
                };
            });
            var map = {
                orphans: [],
                idToComments: {}
            };
            var radius = 20;
            for (var _i = 0, comments_2 = comments; _i < comments_2.length; _i++) {
                var comment = comments_2[_i];
                var bounds = comment.getBoundingRectangle();
                var size = comment.getHeightWidth();
                var x = bounds.left;
                var y = bounds.top;
                var parent_2 = void 0;
                for (var _a = 0, blockBounds_1 = blockBounds; _a < blockBounds_1.length; _a++) {
                    var rect = blockBounds_1[_a];
                    if (doesIntersect(x, y, size.width, size.height, rect)) {
                        parent_2 = rect;
                    }
                    else if (!parent_2 && doesIntersect(x - radius, y - radius, size.width + radius * 2, size.height + radius * 2, rect)) {
                        parent_2 = rect;
                    }
                }
                if (parent_2) {
                    if (!map.idToComments[parent_2.id]) {
                        map.idToComments[parent_2.id] = [];
                    }
                    map.idToComments[parent_2.id].push(comment);
                }
                else {
                    map.orphans.push(comment);
                }
            }
            return map;
        }
        function referencedWithinScope(scope, varID) {
            if (scope.referencedVars.indexOf(varID) !== -1) {
                return true;
            }
            else {
                for (var _i = 0, _a = scope.children; _i < _a.length; _i++) {
                    var child = _a[_i];
                    if (referencedWithinScope(child, varID))
                        return true;
                }
            }
            return false;
        }
        function assignedWithinScope(scope, varID) {
            if (scope.assignedVars.indexOf(varID) !== -1) {
                return true;
            }
            else {
                for (var _i = 0, _a = scope.children; _i < _a.length; _i++) {
                    var child = _a[_i];
                    if (assignedWithinScope(child, varID))
                        return true;
                }
            }
            return false;
        }
        function escapeVariables(current, e) {
            for (var _i = 0, _a = Object.keys(current.declaredVars); _i < _a.length; _i++) {
                var varName = _a[_i];
                var info = current.declaredVars[varName];
                if (!info.escapedName)
                    info.escapedName = escapeVarName(varName);
            }
            current.children.forEach(function (c) { return escapeVariables(c, e); });
            function escapeVarName(name) {
                if (!name)
                    return '_';
                var n = ts.pxtc.escapeIdentifier(name);
                if (e.renames.takenNames[n] || nameIsTaken(n, current)) {
                    var i = 2;
                    while (e.renames.takenNames[n + i] || nameIsTaken(n + i, current)) {
                        i++;
                    }
                    n += i;
                }
                return n;
            }
            function nameIsTaken(name, scope) {
                if (scope) {
                    for (var _i = 0, _a = Object.keys(scope.declaredVars); _i < _a.length; _i++) {
                        var varName = _a[_i];
                        var info = scope.declaredVars[varName];
                        if (info.name !== info.escapedName && info.escapedName === name)
                            return true;
                    }
                    return nameIsTaken(name, scope.parent);
                }
                return false;
            }
        }
        function findCommonScope(current, varID) {
            var ref;
            if (current.referencedVars.indexOf(varID) !== -1) {
                return current;
            }
            for (var _i = 0, _a = current.children; _i < _a.length; _i++) {
                var child = _a[_i];
                if (referencedWithinScope(child, varID)) {
                    if (assignedWithinScope(child, varID)) {
                        return current;
                    }
                    if (!ref) {
                        ref = child;
                    }
                    else {
                        return current;
                    }
                }
            }
            return ref ? findCommonScope(ref, varID) : undefined;
        }
        function trackAllVariables(topBlocks, e) {
            var id = 1;
            var topScope;
            // First, look for on-start
            topBlocks.forEach(function (block) {
                if (block.type === ts.pxtc.ON_START_TYPE) {
                    var firstStatement = block.getInputTargetBlock("HANDLER");
                    if (firstStatement) {
                        topScope = {
                            firstStatement: firstStatement,
                            declaredVars: {},
                            referencedVars: [],
                            children: [],
                            assignedVars: []
                        };
                        trackVariables(firstStatement, topScope, e);
                    }
                }
            });
            // If we didn't find on-start, then create an empty top scope
            if (!topScope) {
                topScope = {
                    firstStatement: null,
                    declaredVars: {},
                    referencedVars: [],
                    children: [],
                    assignedVars: []
                };
            }
            topBlocks.forEach(function (block) {
                if (block.type === ts.pxtc.ON_START_TYPE) {
                    return;
                }
                trackVariables(block, topScope, e);
            });
            Object.keys(topScope.declaredVars).forEach(function (varName) {
                var varID = topScope.declaredVars[varName];
                delete topScope.declaredVars[varName];
                var declaringScope = findCommonScope(topScope, varID.id) || topScope;
                declaringScope.declaredVars[varName] = varID;
            });
            markDeclarationLocations(topScope, e);
            escapeVariables(topScope, e);
            return topScope;
            function trackVariables(block, currentScope, e) {
                e.idToScope[block.id] = currentScope;
                if (block.type === "variables_get") {
                    var name_2 = block.getField("VAR").getText();
                    var info = findOrDeclareVariable(name_2, currentScope);
                    currentScope.referencedVars.push(info.id);
                }
                else if (block.type === "variables_set" || block.type === "variables_change") {
                    var name_3 = block.getField("VAR").getText();
                    var info = findOrDeclareVariable(name_3, currentScope);
                    currentScope.assignedVars.push(info.id);
                    currentScope.referencedVars.push(info.id);
                }
                else if (block.type === pxtc.TS_STATEMENT_TYPE) {
                    var declaredVars = block.declaredVariables;
                    if (declaredVars) {
                        var varNames = declaredVars.split(",");
                        varNames.forEach(function (vName) {
                            var info = findOrDeclareVariable(vName, currentScope);
                            info.alreadyDeclared = BlockDeclarationType.Argument;
                        });
                    }
                }
                if (hasStatementInput(block)) {
                    var vars = getDeclaredVariables(block, e).map(function (binding) {
                        return {
                            name: binding[0],
                            type: binding[1],
                            id: id++
                        };
                    });
                    var parentScope_1 = currentScope;
                    if (vars.length) {
                        // We need to create a scope for this block, and then a scope
                        // for each statement input (in case there are multiple)
                        parentScope_1 = {
                            parent: currentScope,
                            firstStatement: block,
                            declaredVars: {},
                            referencedVars: [],
                            assignedVars: [],
                            children: []
                        };
                        vars.forEach(function (v) {
                            v.alreadyDeclared = BlockDeclarationType.Assigned;
                            parentScope_1.declaredVars[v.name] = v;
                        });
                        e.idToScope[block.id] = parentScope_1;
                    }
                    if (currentScope !== parentScope_1) {
                        currentScope.children.push(parentScope_1);
                    }
                    forEachChildExpression(block, function (child) {
                        trackVariables(child, parentScope_1, e);
                    });
                    forEachStatementInput(block, function (connectedBlock) {
                        var newScope = {
                            parent: parentScope_1,
                            firstStatement: connectedBlock,
                            declaredVars: {},
                            referencedVars: [],
                            assignedVars: [],
                            children: []
                        };
                        parentScope_1.children.push(newScope);
                        trackVariables(connectedBlock, newScope, e);
                    });
                }
                else {
                    forEachChildExpression(block, function (child) {
                        trackVariables(child, currentScope, e);
                    });
                }
                if (block.nextConnection && block.nextConnection.targetBlock()) {
                    trackVariables(block.nextConnection.targetBlock(), currentScope, e);
                }
            }
            function findOrDeclareVariable(name, scope) {
                if (scope.declaredVars[name]) {
                    return scope.declaredVars[name];
                }
                else if (scope.parent) {
                    return findOrDeclareVariable(name, scope.parent);
                }
                else {
                    // Declare it in the top scope
                    scope.declaredVars[name] = {
                        name: name,
                        type: mkPoint(null),
                        id: id++
                    };
                    return scope.declaredVars[name];
                }
            }
        }
        function getVarInfo(name, scope) {
            if (scope && scope.declaredVars[name]) {
                return scope.declaredVars[name];
            }
            else if (scope && scope.parent) {
                return getVarInfo(name, scope.parent);
            }
            else {
                return null;
            }
        }
        function hasStatementInput(block) {
            return block.inputList.some(function (i) { return i.type === Blockly.NEXT_STATEMENT; });
        }
        function getDeclaredVariables(block, e) {
            switch (block.type) {
                case 'pxt_controls_for':
                case 'controls_simple_for':
                    return [[getLoopVariableField(block).getField("VAR").getText(), pNumber]];
                case 'pxt_controls_for_of':
                case 'controls_for_of':
                    return [[getLoopVariableField(block).getField("VAR").getText(), mkPoint(null)]];
                default:
                    break;
            }
            if (isMutatingBlock(block)) {
                var declarations_1 = block.mutation.getDeclaredVariables();
                if (declarations_1) {
                    return Object.keys(declarations_1).map(function (varName) { return [varName, mkPoint(declarations_1[varName])]; });
                }
            }
            var stdFunc = e.stdCallTable[block.type];
            if (stdFunc && stdFunc.comp.handlerArgs.length) {
                return getCBParameters(block, stdFunc);
            }
            return [];
        }
        function forEachChildExpression(block, cb, recursive) {
            if (recursive === void 0) { recursive = false; }
            block.inputList.filter(function (i) { return i.type === Blockly.INPUT_VALUE; }).forEach(function (i) {
                if (i.connection && i.connection.targetBlock()) {
                    cb(i.connection.targetBlock());
                    if (recursive) {
                        forEachChildExpression(i.connection.targetBlock(), cb, recursive);
                    }
                }
            });
        }
        function forEachStatementInput(block, cb) {
            block.inputList.filter(function (i) { return i.type === Blockly.NEXT_STATEMENT; }).forEach(function (i) {
                if (i.connection && i.connection.targetBlock()) {
                    cb(i.connection.targetBlock());
                }
            });
        }
        function printScope(scope, depth) {
            if (depth === void 0) { depth = 0; }
            var declared = Object.keys(scope.declaredVars).map(function (k) { return k + "(" + scope.declaredVars[k].id + ")"; }).join(",");
            var referenced = scope.referencedVars.join(", ");
            console.log(mkIndent(depth) + "SCOPE: " + (scope.firstStatement ? scope.firstStatement.type : "TOP-LEVEL"));
            if (declared.length) {
                console.log(mkIndent(depth) + "DECS: " + declared);
            }
            // console.log(`${mkIndent(depth)}REFS: ${referenced}`)
            scope.children.forEach(function (s) { return printScope(s, depth + 1); });
        }
        function mkIndent(depth) {
            var res = "";
            for (var i = 0; i < depth; i++) {
                res += "    ";
            }
            return res;
        }
        function markDeclarationLocations(scope, e) {
            var declared = Object.keys(scope.declaredVars);
            if (declared.length) {
                var decls = declared.map(function (name) { return scope.declaredVars[name]; });
                if (scope.firstStatement) {
                    // If we can't find a better place to declare the variable, we'll declare
                    // it before the first statement in the code block so we need to keep
                    // track of the blocks ids
                    e.blockDeclarations[scope.firstStatement.id] = decls.concat(e.blockDeclarations[scope.firstStatement.id] || []);
                }
                decls.forEach(function (d) { return e.allVariables.push(d); });
            }
            scope.children.forEach(function (child) { return markDeclarationLocations(child, e); });
        }
        function doesIntersect(x, y, width, height, other) {
            var xOverlap = between(x, other.x, other.x + other.width) || between(other.x, x, x + width);
            var yOverlap = between(y, other.y, other.y + other.height) || between(other.y, y, y + height);
            return xOverlap && yOverlap;
            function between(val, lower, upper) {
                return val >= lower && val <= upper;
            }
        }
        function isFunctionDefinition(b) {
            return b.type === "procedures_defnoreturn" || b.type === "function_definition";
        }
        function getFunctionName(functionBlock) {
            return functionBlock.getField("function_name").getText();
        }
        // @param strict - if true, only return true if there is a return statement
        // somewhere in the call graph that returns a call to this function. If false,
        // return true if the function is called as an expression anywhere in the call
        // graph
        function isFunctionRecursive(b, strict) {
            var functionName = getFunctionName(b);
            var visited = {};
            return checkForCallRecursive(b);
            function checkForCallRecursive(functionDefinition) {
                var calls;
                if (strict) {
                    calls = functionDefinition.getDescendants(false)
                        .filter(function (child) { return child.type == "function_return"; })
                        .map(function (returnStatement) { return getInputTargetBlock(returnStatement, "RETURN_VALUE"); })
                        .filter(function (returnValue) { return returnValue && returnValue.type === "function_call_output"; });
                }
                else {
                    calls = functionDefinition.getDescendants(false).filter(function (child) { return child.type == "function_call_output"; });
                }
                for (var _i = 0, calls_1 = calls; _i < calls_1.length; _i++) {
                    var call = calls_1[_i];
                    var callName = getFunctionName(call);
                    if (callName === functionName)
                        return true;
                    if (visited[callName])
                        continue;
                    visited[callName] = true;
                    if (checkForCallRecursive(Blockly.Functions.getDefinition(callName, call.workspace))) {
                        return true;
                    }
                }
                return false;
            }
        }
        function isPlaceholderBlock(b) {
            return b.type == "placeholder" || b.type === pxtc.TS_OUTPUT_TYPE;
        }
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        var registeredFieldEditors = {};
        function initFieldEditors() {
            registerFieldEditor('text', pxtblockly.FieldTextInput);
            registerFieldEditor('note', pxtblockly.FieldNote);
            registerFieldEditor('gridpicker', pxtblockly.FieldGridPicker);
            registerFieldEditor('textdropdown', pxtblockly.FieldTextDropdown);
            registerFieldEditor('numberdropdown', pxtblockly.FieldNumberDropdown);
            registerFieldEditor('imagedropdown', pxtblockly.FieldImageDropdown);
            registerFieldEditor('colorwheel', pxtblockly.FieldColorWheel);
            registerFieldEditor('toggle', pxtblockly.FieldToggle);
            registerFieldEditor('toggleonoff', pxtblockly.FieldToggleOnOff);
            registerFieldEditor('toggleyesno', pxtblockly.FieldToggleYesNo);
            registerFieldEditor('toggleupdown', pxtblockly.FieldToggleUpDown);
            registerFieldEditor('toggledownup', pxtblockly.FieldToggleDownUp);
            registerFieldEditor('togglehighlow', pxtblockly.FieldToggleHighLow);
            registerFieldEditor('togglewinlose', pxtblockly.FieldToggleWinLose);
            registerFieldEditor('colornumber', pxtblockly.FieldColorNumber);
            registerFieldEditor('images', pxtblockly.FieldImages);
            registerFieldEditor('sprite', pxtblockly.FieldSpriteEditor);
            registerFieldEditor('animation', pxtblockly.FieldAnimationEditor);
            registerFieldEditor('tilemap', pxtblockly.FieldTilemap);
            registerFieldEditor('tileset', pxtblockly.FieldTileset);
            registerFieldEditor('speed', pxtblockly.FieldSpeed);
            registerFieldEditor('turnratio', pxtblockly.FieldTurnRatio);
            registerFieldEditor('protractor', pxtblockly.FieldProtractor);
            registerFieldEditor('position', pxtblockly.FieldPosition);
            registerFieldEditor('melody', pxtblockly.FieldCustomMelody);
        }
        blocks.initFieldEditors = initFieldEditors;
        function registerFieldEditor(selector, field, validator) {
            if (registeredFieldEditors[selector] == undefined) {
                registeredFieldEditors[selector] = {
                    field: field,
                    validator: validator
                };
            }
        }
        blocks.registerFieldEditor = registerFieldEditor;
        function createFieldEditor(selector, text, params) {
            if (registeredFieldEditors[selector] == undefined) {
                console.error("Field editor " + selector + " not registered");
                return null;
            }
            if (!params) {
                params = {};
            }
            pxt.Util.assert(params.lightMode == undefined, "lightMode is a reserved parameter for custom fields");
            params.lightMode = pxt.options.light;
            var customField = registeredFieldEditors[selector];
            var instance = new customField.field(text, params, customField.validator);
            return instance;
        }
        blocks.createFieldEditor = createFieldEditor;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        // sniff ids to see if the xml was completly reconstructed
        function needsDecompiledDiff(oldXml, newXml) {
            if (!oldXml || !newXml)
                return false;
            // collect all ids
            var oldids = {};
            oldXml.replace(/id="([^"]+)"/g, function (m, id) { oldids[id] = true; return ""; });
            if (!Object.keys(oldids).length)
                return false;
            // test if any newid exists in old
            var total = 0;
            var found = 0;
            newXml.replace(/id="([^"]+)"/g, function (m, id) {
                total++;
                if (oldids[id])
                    found++;
                return "";
            });
            return total > 0 && found == 0;
        }
        blocks.needsDecompiledDiff = needsDecompiledDiff;
        function diffXml(oldXml, newXml, options) {
            var oldWs = pxt.blocks.loadWorkspaceXml(oldXml, true);
            var newWs = pxt.blocks.loadWorkspaceXml(newXml, true);
            return diffWorkspace(oldWs, newWs, options);
        }
        blocks.diffXml = diffXml;
        var UNMODIFIED_COLOR = "#d0d0d0";
        // Workspaces are modified in place!
        function diffWorkspace(oldWs, newWs, options) {
            try {
                Blockly.Events.disable();
                return diffWorkspaceNoEvents(oldWs, newWs, options);
            }
            catch (e) {
                pxt.reportException(e);
                return {
                    ws: undefined,
                    message: lf("Oops, we could not diff those blocks."),
                    error: e,
                    deleted: 0,
                    added: 0,
                    modified: 0
                };
            }
            finally {
                Blockly.Events.enable();
            }
        }
        function logger() {
            var log = pxt.options.debug || (window && /diffdbg=1/.test(window.location.href))
                ? console.log : function (message) {
                var args = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    args[_i - 1] = arguments[_i];
                }
            };
            return log;
        }
        function diffWorkspaceNoEvents(oldWs, newWs, options) {
            pxt.tickEvent("blocks.diff", { started: 1 });
            options = options || {};
            var log = logger();
            if (!oldWs) {
                return {
                    ws: undefined,
                    message: lf("All blocks are new."),
                    added: 0,
                    deleted: 0,
                    modified: 1
                }; // corrupted blocks
            }
            if (!newWs) {
                return {
                    ws: undefined,
                    message: lf("The current blocks seem corrupted."),
                    added: 0,
                    deleted: 0,
                    modified: 1
                }; // corrupted blocks
            }
            // remove all unmodified topblocks
            // when doing a Blocks->TS roundtrip, all ids are trashed.
            var oldXml = pxt.Util.toDictionary(oldWs.getTopBlocks(false), function (b) { return normalizedDom(b, true); });
            newWs.getTopBlocks(false)
                .forEach(function (newb) {
                var newn = normalizedDom(newb, true);
                // try to find by id or by matching normalized xml
                var oldb = oldWs.getBlockById(newb.id) || oldXml[newn];
                if (oldb) {
                    var oldn = normalizedDom(oldb, true);
                    if (newn == oldn) {
                        log("fast unmodified top ", newb.id);
                        newb.dispose(false);
                        oldb.dispose(false);
                    }
                }
            });
            // we'll ignore disabled blocks in the final output
            var oldBlocks = oldWs.getAllBlocks().filter(function (b) { return b.isEnabled(); });
            var oldTopBlocks = oldWs.getTopBlocks(false).filter(function (b) { return b.isEnabled(); });
            var newBlocks = newWs.getAllBlocks().filter(function (b) { return b.isEnabled(); });
            log("blocks", newBlocks.map(function (b) { return b.toDevString(); }));
            log(newBlocks);
            if (oldBlocks.length == 0 && newBlocks.length == 0) {
                pxt.tickEvent("blocks.diff", { moves: 1 });
                return {
                    ws: undefined,
                    message: lf("Some blocks were moved or changed."),
                    added: 0,
                    deleted: 0,
                    modified: 1
                }; // just moves
            }
            // locate deleted and added blocks
            var deletedTopBlocks = oldTopBlocks.filter(function (b) { return !newWs.getBlockById(b.id); });
            var deletedBlocks = oldBlocks.filter(function (b) { return !newWs.getBlockById(b.id); });
            var addedBlocks = newBlocks.filter(function (b) { return !oldWs.getBlockById(b.id); });
            // clone new workspace into rendering workspace
            var ws = pxt.blocks.initRenderingWorkspace();
            var newXml = pxt.blocks.saveWorkspaceXml(newWs, true);
            pxt.blocks.domToWorkspaceNoEvents(Blockly.Xml.textToDom(newXml), ws);
            // delete disabled blocks from final workspace
            ws.getAllBlocks().filter(function (b) { return !b.isEnabled(); }).forEach(function (b) {
                log('disabled ', b.toDevString());
                b.dispose(false);
            });
            var todoBlocks = pxt.Util.toDictionary(ws.getAllBlocks(), function (b) { return b.id; });
            log("todo blocks", todoBlocks);
            logTodo('start');
            // 1. deleted top blocks
            if (!options.hideDeletedTopBlocks) {
                deletedTopBlocks.forEach(function (b) {
                    log("deleted top " + b.toDevString());
                    done(b);
                    var b2 = cloneIntoDiff(b);
                    done(b2);
                    b2.setDisabled(true);
                });
                logTodo('deleted top');
            }
            // 2. added blocks
            addedBlocks.map(function (b) { return ws.getBlockById(b.id); })
                .filter(function (b) { return !!b; }) // ignore disabled
                .forEach(function (b) {
                log("added " + b.toDevString());
                //b.inputList[0].insertFieldAt(0, new Blockly.FieldImage(ADD_IMAGE_DATAURI, 24, 24, false));
                done(b);
            });
            logTodo('added');
            // 3. delete statement blocks
            // inject deleted blocks in new workspace
            var dids = {};
            if (!options.hideDeletedBlocks) {
                var deletedStatementBlocks = deletedBlocks
                    .filter(function (b) { return !todoBlocks[b.id]
                    && !isUsed(b)
                    && (!b.outputConnection || !b.outputConnection.isConnected()); } // ignore reporters
                );
                deletedStatementBlocks
                    .forEach(function (b) {
                    var b2 = cloneIntoDiff(b);
                    dids[b.id] = b2.id;
                    log("deleted block " + b.toDevString() + "->" + b2.toDevString());
                });
                // connect deleted blocks together
                deletedStatementBlocks
                    .forEach(function (b) { return stitch(b); });
            }
            // 4. moved blocks
            var modified = 0;
            pxt.Util.values(todoBlocks).filter(function (b) { return moved(b); }).forEach(function (b) {
                log("moved " + b.toDevString());
                delete todoBlocks[b.id];
                markUsed(b);
                modified++;
            });
            logTodo('moved');
            // 5. blocks with field properties that changed
            pxt.Util.values(todoBlocks).filter(function (b) { return changed(b); }).forEach(function (b) {
                log("changed " + b.toDevString());
                delete todoBlocks[b.id];
                markUsed(b);
                modified++;
            });
            logTodo('changed');
            // delete unmodified top blocks
            ws.getTopBlocks(false)
                .forEach(function (b) {
                if (!findUsed(b)) {
                    log("unmodified top " + b.toDevString());
                    delete todoBlocks[b.id];
                    b.dispose(false);
                }
            });
            logTodo('cleaned');
            // all unmodifed blocks are greyed out
            pxt.Util.values(todoBlocks).filter(function (b) { return !!ws.getBlockById(b.id); }).forEach(function (b) {
                unmodified(b);
            });
            logTodo('unmodified');
            // if nothing is left in the workspace, we "missed" change
            if (!ws.getAllBlocks().length) {
                pxt.tickEvent("blocks.diff", { missed: 1 });
                return {
                    ws: ws,
                    message: lf("Some blocks were changed."),
                    deleted: deletedBlocks.length,
                    added: addedBlocks.length,
                    modified: modified
                };
            }
            // make sure everything is rendered
            ws.resize();
            Blockly.svgResize(ws);
            // final render
            var svg = pxt.blocks.renderWorkspace(options.renderOptions || {
                emPixels: 20,
                layout: blocks.BlockLayout.Flow,
                aspectRatio: 0.5,
                useViewWidth: true
            });
            // and we're done
            var r = {
                ws: ws,
                svg: svg,
                deleted: deletedBlocks.length,
                added: addedBlocks.length,
                modified: modified
            };
            pxt.tickEvent("blocks.diff", { deleted: r.deleted, added: r.added, modified: r.modified });
            return r;
            function stitch(b) {
                log("stitching " + b.toDevString() + "->" + dids[b.id]);
                var wb = ws.getBlockById(dids[b.id]);
                wb.setDisabled(true);
                markUsed(wb);
                done(wb);
                // connect previous connection to delted or existing block
                var previous = b.getPreviousBlock();
                if (previous) {
                    var previousw = ws.getBlockById(dids[previous.id]) || ws.getBlockById(previous.id);
                    log("previous " + b.id + "->" + wb.toDevString() + ": " + previousw.toDevString());
                    if (previousw) {
                        // either connected under or in the block
                        if (previousw.nextConnection)
                            wb.previousConnection.connect(previousw.nextConnection);
                        else {
                            var ic = previousw.inputList.slice()
                                .reverse()
                                .find(function (input) { return input.connection && input.connection.type == Blockly.NEXT_STATEMENT; });
                            if (ic)
                                wb.previousConnection.connect(ic.connection);
                        }
                    }
                }
                // connect next connection to delete or existing block
                var next = b.getNextBlock();
                if (next) {
                    var nextw = ws.getBlockById(dids[next.id]) || ws.getBlockById(next.id);
                    if (nextw) {
                        log("next " + b.id + "->" + wb.toDevString() + ": " + nextw.toDevString());
                        wb.nextConnection.connect(nextw.previousConnection);
                    }
                }
            }
            function markUsed(b) {
                b.__pxt_used = true;
            }
            function isUsed(b) {
                return !!b.__pxt_used;
            }
            function cloneIntoDiff(b) {
                var bdom = Blockly.Xml.blockToDom(b, false);
                var b2 = Blockly.Xml.domToBlock(bdom, ws);
                // disconnect
                if (b2.nextConnection && b2.nextConnection.targetConnection)
                    b2.nextConnection.disconnect();
                if (b2.previousConnection && b2.previousConnection.targetConnection)
                    b2.previousConnection.disconnect();
                return b2;
            }
            function forceRender(b) {
                var a = b;
                a.rendered = false;
                b.inputList.forEach(function (i) { return i.fieldRow.forEach(function (f) {
                    f.init();
                    if (f.borderRect_) {
                        f.borderRect_.setAttribute('fill', b.getColour());
                        f.borderRect_.setAttribute('stroke', b.getColourTertiary());
                    }
                }); });
            }
            function done(b) {
                b.getDescendants(false).forEach(function (t) { delete todoBlocks[t.id]; markUsed(t); });
            }
            function findUsed(b) {
                return !!b.getDescendants(false).find(function (c) { return isUsed(c); });
            }
            function logTodo(msg) {
                log(msg + ":", pxt.Util.values(todoBlocks).map(function (b) { return b.toDevString(); }));
            }
            function moved(b) {
                var oldb = oldWs.getBlockById(b.id); // extra block created in added step
                if (!oldb)
                    return false;
                var newPrevious = b.getPreviousBlock();
                // connection already already processed
                if (newPrevious && !todoBlocks[newPrevious.id])
                    return false;
                var newNext = b.getNextBlock();
                // already processed
                if (newNext && !todoBlocks[newNext.id])
                    return false;
                var oldPrevious = oldb.getPreviousBlock();
                if (!oldPrevious && !newPrevious)
                    return false; // no connection
                if (!!oldPrevious != !!newPrevious // new connection
                    || oldPrevious.id != newPrevious.id) // new connected blocks
                    return true;
                var oldNext = oldb.getNextBlock();
                if (!oldNext && !newNext)
                    return false; // no connection
                if (!!oldNext != !!newNext // new connection
                    || oldNext.id != newNext.id) // new connected blocks
                    return true;
                return false;
            }
            function changed(b) {
                var oldb = oldWs.getBlockById(b.id); // extra block created in added step
                if (!oldb)
                    return false;
                // normalize
                //oldb = copyToTrashWs(oldb);
                var oldText = normalizedDom(oldb);
                //b = copyToTrashWs(b);
                var newText = normalizedDom(b);
                if (oldText != newText) {
                    log("old " + oldb.toDevString(), oldText);
                    log("new " + b.toDevString(), newText);
                    return true;
                }
                // not changed!
                return false;
            }
            function unmodified(b) {
                b.setColour(UNMODIFIED_COLOR);
                forceRender(b);
                if (options.statementsOnly) {
                    // mark all nested reporters as unmodified
                    (b.inputList || [])
                        .map(function (input) { return input.type == Blockly.INPUT_VALUE && input.connection && input.connection.targetBlock(); })
                        .filter(function (argBlock) { return !!argBlock; })
                        .forEach(function (argBlock) { return unmodified(argBlock); });
                }
            }
        }
        function mergeXml(xmlA, xmlO, xmlB) {
            if (xmlA == xmlO)
                return xmlB;
            if (xmlB == xmlO)
                return xmlA;
            // TODO merge
            return undefined;
        }
        blocks.mergeXml = mergeXml;
        function normalizedDom(b, keepChildren) {
            var dom = Blockly.Xml.blockToDom(b, true);
            normalizeAttributes(dom);
            visDom(dom, function (e) {
                normalizeAttributes(e);
                if (!keepChildren) {
                    if (e.localName == "next")
                        e.remove(); // disconnect or unplug not working propertly
                    else if (e.localName == "statement")
                        e.remove();
                    else if (e.localName == "shadow") // ignore internal nodes
                        e.remove();
                }
            });
            return Blockly.Xml.domToText(dom);
        }
        function normalizeAttributes(e) {
            e.removeAttribute("id");
            e.removeAttribute("x");
            e.removeAttribute("y");
            e.removeAttribute("deletable");
            e.removeAttribute("editable");
            e.removeAttribute("movable");
        }
        function visDom(el, f) {
            if (!el)
                return;
            f(el);
            for (var _i = 0, _a = pxt.Util.toArray(el.children); _i < _a.length; _i++) {
                var child = _a[_i];
                visDom(child, f);
            }
        }
        function decompiledDiffAsync(oldTs, oldResp, newTs, newResp, options) {
            if (options === void 0) { options = {}; }
            var log = logger();
            var oldXml = oldResp.outfiles['main.blocks'];
            var newXml = newResp.outfiles['main.blocks'];
            log(oldXml);
            log(newXml);
            // compute diff of typescript sources
            var diffLines = pxt.diff.compute(oldTs, newTs, {
                ignoreWhitespace: true,
                full: true
            });
            log(diffLines);
            // build old -> new lines mapping
            var newids = {};
            var oldLineStart = 0;
            var newLineStart = 0;
            diffLines.forEach(function (ln, index) {
                // moving cursors
                var marker = ln[0];
                var line = ln.substr(2);
                var lineLength = line.length;
                switch (marker) {
                    case "-": // removed
                        oldLineStart += lineLength + 1;
                        break;
                    case "+": // added
                        newLineStart += lineLength + 1;
                        break;
                    default: // unchanged
                        // skip leading white space
                        var lw = /^\s+/.exec(line);
                        if (lw) {
                            var lwl = lw[0].length;
                            oldLineStart += lwl;
                            newLineStart += lwl;
                            lineLength -= lwl;
                        }
                        // find block ids mapped to the ranges
                        var newid = pxt.blocks.findBlockIdByPosition(newResp.blockSourceMap, {
                            start: newLineStart,
                            length: lineLength
                        });
                        if (newid && !newids[newid]) {
                            var oldid = pxt.blocks.findBlockIdByPosition(oldResp.blockSourceMap, {
                                start: oldLineStart,
                                length: lineLength
                            });
                            // patch workspace
                            if (oldid) {
                                log(ln);
                                log("id " + oldLineStart + ":" + line.length + ">" + oldid + " ==> " + newLineStart + ":" + line.length + ">" + newid);
                                newids[newid] = oldid;
                                newXml = newXml.replace(newid, oldid);
                            }
                        }
                        oldLineStart += lineLength + 1;
                        newLineStart += lineLength + 1;
                        break;
                }
            });
            // parse workspacews
            var oldWs = pxt.blocks.loadWorkspaceXml(oldXml, true);
            var newWs = pxt.blocks.loadWorkspaceXml(newXml, true);
            options.statementsOnly = true; // no info on expression diffs
            return diffWorkspace(oldWs, newWs, options);
        }
        blocks.decompiledDiffAsync = decompiledDiffAsync;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
///<reference path='../localtypings/pxtblockly.d.ts'/>
/// <reference path="../built/pxtlib.d.ts" />
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks_2) {
        /**
         * Converts a DOM into workspace without triggering any Blockly event. Returns the new block ids
         * @param dom
         * @param workspace
         */
        function domToWorkspaceNoEvents(dom, workspace) {
            pxt.tickEvent("blocks.domtow");
            try {
                Blockly.Events.disable();
                var newBlockIds = Blockly.Xml.domToWorkspace(dom, workspace);
                applyMetaComments(workspace);
                return newBlockIds;
            }
            finally {
                Blockly.Events.enable();
            }
        }
        blocks_2.domToWorkspaceNoEvents = domToWorkspaceNoEvents;
        function applyMetaComments(workspace) {
            // process meta comments
            // @highlight -> highlight block
            workspace.getAllBlocks()
                .filter(function (b) { return !!b.comment && b.comment instanceof Blockly.Comment; })
                .forEach(function (b) {
                var c = b.comment.getText();
                if (/@highlight/.test(c)) {
                    var cc = c.replace(/@highlight/g, '').trim();
                    b.setCommentText(cc || null);
                    workspace.highlightBlock(b.id);
                }
            });
        }
        function clearWithoutEvents(workspace) {
            pxt.tickEvent("blocks.clear");
            if (!workspace)
                return;
            try {
                Blockly.Events.disable();
                workspace.clear();
                workspace.clearUndo();
            }
            finally {
                Blockly.Events.enable();
            }
        }
        blocks_2.clearWithoutEvents = clearWithoutEvents;
        // Saves entire workspace, including variables, into an xml string
        function saveWorkspaceXml(ws, keepIds) {
            var xml = Blockly.Xml.workspaceToDom(ws, !keepIds);
            var text = Blockly.Xml.domToText(xml);
            return text;
        }
        blocks_2.saveWorkspaceXml = saveWorkspaceXml;
        // Saves only the blocks xml by iterating over the top blocks
        function saveBlocksXml(ws, keepIds) {
            var topBlocks = ws.getTopBlocks(false);
            return topBlocks.map(function (block) {
                return Blockly.Xml.domToText(Blockly.Xml.blockToDom(block, !keepIds));
            });
        }
        blocks_2.saveBlocksXml = saveBlocksXml;
        function getDirectChildren(parent, tag) {
            var res = [];
            for (var i = 0; i < parent.childNodes.length; i++) {
                var n = parent.childNodes.item(i);
                if (n.tagName === tag) {
                    res.push(n);
                }
            }
            return res;
        }
        blocks_2.getDirectChildren = getDirectChildren;
        function getBlocksWithType(parent, type) {
            return getChildrenWithAttr(parent, "block", "type", type).concat(getChildrenWithAttr(parent, "shadow", "type", type));
        }
        blocks_2.getBlocksWithType = getBlocksWithType;
        function getChildrenWithAttr(parent, tag, attr, value) {
            return pxt.Util.toArray(parent.getElementsByTagName(tag)).filter(function (b) { return b.getAttribute(attr) === value; });
        }
        blocks_2.getChildrenWithAttr = getChildrenWithAttr;
        function getFirstChildWithAttr(parent, tag, attr, value) {
            var res = getChildrenWithAttr(parent, tag, attr, value);
            return res.length ? res[0] : undefined;
        }
        blocks_2.getFirstChildWithAttr = getFirstChildWithAttr;
        function loadBlocksXml(ws, text) {
            var xmlBlock = Blockly.Xml.textToDom(text);
            var block = Blockly.Xml.domToBlock(xmlBlock, ws);
            if (ws.getMetrics) {
                var metrics = ws.getMetrics();
                var blockDimensions = block.getHeightWidth();
                block.moveBy(metrics.viewLeft + (metrics.viewWidth / 2) - (blockDimensions.width / 2), metrics.viewTop + (metrics.viewHeight / 2) - (blockDimensions.height / 2));
            }
        }
        blocks_2.loadBlocksXml = loadBlocksXml;
        /**
         * Loads the xml into a off-screen workspace (not suitable for size computations)
         */
        function loadWorkspaceXml(xml, skipReport) {
            if (skipReport === void 0) { skipReport = false; }
            var workspace = new Blockly.Workspace();
            try {
                var dom_1 = Blockly.Xml.textToDom(xml);
                pxt.blocks.domToWorkspaceNoEvents(dom_1, workspace);
                return workspace;
            }
            catch (e) {
                if (!skipReport)
                    pxt.reportException(e);
                return null;
            }
        }
        blocks_2.loadWorkspaceXml = loadWorkspaceXml;
        function patchFloatingBlocks(dom, info) {
            var onstarts = getBlocksWithType(dom, ts.pxtc.ON_START_TYPE);
            var onstart = onstarts.length ? onstarts[0] : undefined;
            if (onstart) { // nothing to do
                onstart.removeAttribute("deletable");
                return;
            }
            var newnodes = [];
            var blocks = info.blocksById;
            // walk top level blocks
            var node = dom.firstElementChild;
            var insertNode = undefined;
            while (node) {
                var nextNode = node.nextElementSibling;
                // does this block is disable or have s nested statement block?
                var nodeType = node.getAttribute("type");
                if (!node.getAttribute("disabled") && !node.getElementsByTagName("statement").length
                    && (pxt.blocks.buildinBlockStatements[nodeType] ||
                        (blocks[nodeType] && blocks[nodeType].retType == "void" && !blocks_2.hasArrowFunction(blocks[nodeType])))) {
                    // old block, needs to be wrapped in onstart
                    if (!insertNode) {
                        insertNode = dom.ownerDocument.createElement("statement");
                        insertNode.setAttribute("name", "HANDLER");
                        if (!onstart) {
                            onstart = dom.ownerDocument.createElement("block");
                            onstart.setAttribute("type", ts.pxtc.ON_START_TYPE);
                            newnodes.push(onstart);
                        }
                        onstart.appendChild(insertNode);
                        insertNode.appendChild(node);
                        node.removeAttribute("x");
                        node.removeAttribute("y");
                        insertNode = node;
                    }
                    else {
                        // event, add nested statement
                        var next = dom.ownerDocument.createElement("next");
                        next.appendChild(node);
                        insertNode.appendChild(next);
                        node.removeAttribute("x");
                        node.removeAttribute("y");
                        insertNode = node;
                    }
                }
                node = nextNode;
            }
            newnodes.forEach(function (n) { return dom.appendChild(n); });
        }
        /**
         * Patch to transform old function blocks to new ones, and rename child nodes
         */
        function patchFunctionBlocks(dom, info) {
            var functionNodes = pxt.U.toArray(dom.querySelectorAll("block[type=procedures_defnoreturn]"));
            functionNodes.forEach(function (node) {
                node.setAttribute("type", "function_definition");
                node.querySelector("field[name=NAME]").setAttribute("name", "function_name");
            });
            var functionCallNodes = pxt.U.toArray(dom.querySelectorAll("block[type=procedures_callnoreturn]"));
            functionCallNodes.forEach(function (node) {
                node.setAttribute("type", "function_call");
                node.querySelector("field[name=NAME]").setAttribute("name", "function_name");
            });
        }
        function importXml(pkgTargetVersion, xml, info, skipReport) {
            if (skipReport === void 0) { skipReport = false; }
            try {
                // If it's the first project we're importing in the session, Blockly is not initialized
                // and blocks haven't been injected yet
                pxt.blocks.initializeAndInject(info);
                var parser = new DOMParser();
                var doc_1 = parser.parseFromString(xml, "application/xml");
                var upgrades = pxt.patching.computePatches(pkgTargetVersion);
                if (upgrades) {
                    // patch block types
                    upgrades.filter(function (up) { return up.type == "blockId"; })
                        .forEach(function (up) { return Object.keys(up.map).forEach(function (type) {
                        getBlocksWithType(doc_1, type)
                            .forEach(function (blockNode) {
                            blockNode.setAttribute("type", up.map[type]);
                            pxt.debug("patched block " + type + " -> " + up.map[type]);
                        });
                    }); });
                    // patch block value
                    upgrades.filter(function (up) { return up.type == "blockValue"; })
                        .forEach(function (up) { return Object.keys(up.map).forEach(function (k) {
                        var m = k.split('.');
                        var type = m[0];
                        var name = m[1];
                        getBlocksWithType(doc_1, type)
                            .reduce(function (prev, current) { return prev.concat(getDirectChildren(current, "value")); }, [])
                            .forEach(function (blockNode) {
                            blockNode.setAttribute("name", up.map[k]);
                            pxt.debug("patched block value " + k + " -> " + up.map[k]);
                        });
                    }); });
                    // patch enum variables
                    upgrades.filter(function (up) { return up.type == "userenum"; })
                        .forEach(function (up) { return Object.keys(up.map).forEach(function (k) {
                        getChildrenWithAttr(doc_1, "variable", "type", k).forEach(function (el) {
                            el.setAttribute("type", up.map[k]);
                            pxt.debug("patched enum variable type " + k + " -> " + up.map[k]);
                        });
                    }); });
                }
                // build upgrade map
                var enums_1 = {};
                Object.keys(info.apis.byQName).forEach(function (k) {
                    var api = info.apis.byQName[k];
                    if (api.kind == 7 /* EnumMember */)
                        enums_1[api.namespace + '.' + (api.attributes.blockImportId || api.attributes.block || api.attributes.blockId || api.name)]
                            = api.namespace + '.' + api.name;
                });
                // walk through blocks and patch enums
                var blocks_3 = doc_1.getElementsByTagName("block");
                for (var i = 0; i < blocks_3.length; ++i)
                    patchBlock(info, enums_1, blocks_3[i]);
                // patch floating blocks
                patchFloatingBlocks(doc_1.documentElement, info);
                // patch function blocks
                patchFunctionBlocks(doc_1.documentElement, info);
                // apply extension patches
                if (pxt.blocks.extensionBlocklyPatch)
                    pxt.blocks.extensionBlocklyPatch(pkgTargetVersion, doc_1.documentElement);
                // serialize and return
                return new XMLSerializer().serializeToString(doc_1);
            }
            catch (e) {
                if (!skipReport)
                    pxt.reportException(e);
                return xml;
            }
        }
        blocks_2.importXml = importXml;
        function patchBlock(info, enums, block) {
            var _a;
            var type = block.getAttribute("type");
            var b = Blockly.Blocks[type];
            var symbol = blocks_2.blockSymbol(type);
            if (!symbol || !b)
                return;
            var comp = blocks_2.compileInfo(symbol);
            (_a = symbol.parameters) === null || _a === void 0 ? void 0 : _a.forEach(function (p, i) {
                var ptype = info.apis.byQName[p.type];
                if (ptype && ptype.kind == 6 /* Enum */) {
                    var field = getFirstChildWithAttr(block, "field", "name", comp.actualNameToParam[p.name].definitionName);
                    if (field) {
                        var en = enums[ptype.name + '.' + field.textContent];
                        if (en)
                            field.textContent = en;
                    }
                    /*
    <block type="device_button_event" x="92" y="77">
        <field name="NAME">Button.AB</field>
      </block>
                      */
                }
            });
        }
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks_4) {
        var layout;
        (function (layout) {
            function patchBlocksFromOldWorkspace(blockInfo, oldWs, newXml) {
                var newWs = pxt.blocks.loadWorkspaceXml(newXml, true);
                // position blocks
                alignBlocks(blockInfo, oldWs, newWs);
                // inject disabled blocks
                return injectDisabledBlocks(oldWs, newWs);
            }
            layout.patchBlocksFromOldWorkspace = patchBlocksFromOldWorkspace;
            function injectDisabledBlocks(oldWs, newWs) {
                var oldDom = Blockly.Xml.workspaceToDom(oldWs, true);
                var newDom = Blockly.Xml.workspaceToDom(newWs, true);
                pxt.Util.toArray(oldDom.childNodes)
                    .filter(function (n) { return n.nodeType == Node.ELEMENT_NODE && n.localName == "block" && n.getAttribute("disabled") == "true"; })
                    .forEach(function (n) { return newDom.appendChild(newDom.ownerDocument.importNode(n, true)); });
                var updatedXml = Blockly.Xml.domToText(newDom);
                return updatedXml;
            }
            function alignBlocks(blockInfo, oldWs, newWs) {
                var env;
                var newBlocks; // support for multiple events with similar name
                oldWs.getTopBlocks(false).filter(function (ob) { return ob.isEnabled(); })
                    .forEach(function (ob) {
                    var otp = ob.xy_;
                    if (otp && otp.x != 0 && otp.y != 0) {
                        if (!env) {
                            env = pxt.blocks.mkEnv(oldWs, blockInfo);
                            newBlocks = {};
                            newWs.getTopBlocks(false).forEach(function (b) {
                                var nkey = pxt.blocks.callKey(env, b);
                                var nbs = newBlocks[nkey] || [];
                                nbs.push(b);
                                newBlocks[nkey] = nbs;
                            });
                        }
                        var oldKey = pxt.blocks.callKey(env, ob);
                        var newBlock = (newBlocks[oldKey] || []).shift();
                        if (newBlock)
                            newBlock.xy_ = otp.clone();
                    }
                });
            }
            /**
             * Splits a blockly SVG AFTER a vertical layout. This function relies on the ordering
             * of blocks / comments to get as getTopBlock(true)/getTopComment(true)
             */
            function splitSvg(svg, ws, emPixels) {
                if (emPixels === void 0) { emPixels = 18; }
                var comments = ws.getTopComments(true);
                var blocks = ws.getTopBlocks(true);
                // don't split for a single block
                if (comments.length + blocks.length < 2)
                    return svg;
                var div = document.createElement("div");
                div.className = "blocks-svg-list " + ws.getInjectionDiv().className;
                function extract(parentClass, otherClass, blocki, size, translate) {
                    var svgclone = svg.cloneNode(true);
                    // collect all blocks
                    var parentSvg = svgclone.querySelector("g.blocklyWorkspace > g." + parentClass);
                    var otherSvg = svgclone.querySelector("g.blocklyWorkspace > g." + otherClass);
                    var blocksSvg = pxt.Util.toArray(parentSvg.querySelectorAll("g.blocklyWorkspace > g." + parentClass + " > g[data-id]"));
                    var blockSvg = blocksSvg.splice(blocki, 1)[0];
                    if (!blockSvg) {
                        // seems like no blocks were generated
                        pxt.log("missing block, did block failed to load?");
                        return;
                    }
                    // remove all but the block we care about
                    blocksSvg.filter(function (g) { return g != blockSvg; })
                        .forEach(function (g) {
                        g.parentNode.removeChild(g);
                    });
                    // clear transform, remove other group
                    parentSvg.removeAttribute("transform");
                    otherSvg.parentNode.removeChild(otherSvg);
                    // patch size
                    blockSvg.setAttribute("transform", "translate(" + translate.x + ", " + translate.y + ")");
                    var width = (size.width / emPixels) + "em";
                    var height = (size.height / emPixels) + "em";
                    svgclone.setAttribute("viewBox", "0 0 " + size.width + " " + size.height);
                    svgclone.style.width = width;
                    svgclone.style.height = height;
                    svgclone.setAttribute("width", width);
                    svgclone.setAttribute("height", height);
                    div.appendChild(svgclone);
                }
                comments.forEach(function (comment, commenti) { return extract('blocklyBubbleCanvas', 'blocklyBlockCanvas', commenti, comment.getHeightWidth(), { x: 0, y: 0 }); });
                blocks.forEach(function (block, blocki) {
                    var size = block.getHeightWidth();
                    var translate = { x: 0, y: 0 };
                    if (block.getStartHat()) {
                        size.height += emPixels;
                        translate.y += emPixels;
                    }
                    extract('blocklyBlockCanvas', 'blocklyBubbleCanvas', blocki, size, translate);
                });
                return div;
            }
            layout.splitSvg = splitSvg;
            function verticalAlign(ws, emPixels) {
                var y = 0;
                var comments = ws.getTopComments(true);
                comments.forEach(function (comment) {
                    comment.moveBy(0, y);
                    y += comment.getHeightWidth().height;
                    y += emPixels; //buffer
                });
                var blocks = ws.getTopBlocks(true);
                blocks.forEach(function (block, bi) {
                    // TODO: REMOVE THIS WHEN FIXED IN PXT-BLOCKLY
                    if (block.getStartHat())
                        y += emPixels; // hat height
                    block.moveBy(0, y);
                    y += block.getHeightWidth().height;
                    y += emPixels; //buffer
                });
            }
            layout.verticalAlign = verticalAlign;
            function setCollapsedAll(ws, collapsed) {
                ws.getTopBlocks(false)
                    .filter(function (b) { return b.isEnabled(); })
                    .forEach(function (b) { return b.setCollapsed(collapsed); });
            }
            layout.setCollapsedAll = setCollapsedAll;
            // Workspace margins
            var marginx = 20;
            var marginy = 20;
            function flow(ws, opts) {
                if (opts) {
                    if (opts.useViewWidth) {
                        var metrics = ws.getMetrics();
                        // Only use the width if in portrait, otherwise the blocks are too spread out
                        if (metrics.viewHeight > metrics.viewWidth) {
                            flowBlocks(ws.getTopComments(true), ws.getTopBlocks(true), undefined, metrics.viewWidth);
                            ws.scroll(marginx, marginy);
                            return;
                        }
                    }
                    flowBlocks(ws.getTopComments(true), ws.getTopBlocks(true), opts.ratio);
                }
                else {
                    flowBlocks(ws.getTopComments(true), ws.getTopBlocks(true));
                }
                ws.scroll(marginx, marginy);
            }
            layout.flow = flow;
            function screenshotEnabled() {
                return !pxt.BrowserUtils.isIE()
                    && !pxt.BrowserUtils.isUwpEdge(); // TODO figure out why screenshots are not working in UWP; disable for now
            }
            layout.screenshotEnabled = screenshotEnabled;
            function screenshotAsync(ws, pixelDensity, encodeBlocks) {
                return toPngAsync(ws, pixelDensity, encodeBlocks);
            }
            layout.screenshotAsync = screenshotAsync;
            function toPngAsync(ws, pixelDensity, encodeBlocks) {
                var blockSnippet;
                if (encodeBlocks) {
                    blockSnippet = {
                        target: pxt.appTarget.id,
                        versions: pxt.appTarget.versions,
                        xml: pxt.blocks.saveBlocksXml(ws).map(function (text) { return pxt.Util.htmlEscape(text); })
                    };
                }
                return toSvgAsync(ws)
                    .then(function (sg) {
                    if (!sg)
                        return Promise.resolve(undefined);
                    return toPngAsyncInternal(sg.width, sg.height, (pixelDensity | 0) || 4, sg.xml, encodeBlocks ? JSON.stringify(blockSnippet, null, 2) : null);
                }).catch(function (e) {
                    pxt.reportException(e);
                    return undefined;
                });
            }
            layout.toPngAsync = toPngAsync;
            var MAX_SCREENSHOT_SIZE = 1e6; // max 1Mb
            function toPngAsyncInternal(width, height, pixelDensity, data, text) {
                return new Promise(function (resolve, reject) {
                    var cvs = document.createElement("canvas");
                    var ctx = cvs.getContext("2d");
                    var img = new Image;
                    cvs.width = width * pixelDensity;
                    cvs.height = height * pixelDensity;
                    img.onload = function () {
                        if (text) {
                            ctx.fillStyle = "#fff";
                            ctx.fillRect(0, 0, cvs.width, cvs.height);
                        }
                        ctx.drawImage(img, 0, 0, width, height, 0, 0, cvs.width, cvs.height);
                        var canvasdata = cvs.toDataURL("image/png");
                        // if the generated image is too big, shrink image
                        while (canvasdata.length > MAX_SCREENSHOT_SIZE) {
                            cvs.width = (cvs.width / 2) >> 0;
                            cvs.height = (cvs.height / 2) >> 0;
                            pxt.log("screenshot size " + canvasdata.length + "b, shrinking to " + cvs.width + "x" + cvs.height);
                            ctx.drawImage(img, 0, 0, width, height, 0, 0, cvs.width, cvs.height);
                            canvasdata = cvs.toDataURL("image/png");
                        }
                        if (text) {
                            var p = pxt.lzmaCompressAsync(text).then(function (blob) {
                                var datacvs = pxt.Util.encodeBlobAsync(cvs, blob);
                                resolve(datacvs.toDataURL("image/png"));
                            });
                            p.done();
                        }
                        else {
                            resolve(canvasdata);
                        }
                    };
                    img.onerror = function (ev) {
                        pxt.reportError("blocks", "blocks screenshot failed");
                        resolve(undefined);
                    };
                    img.src = data;
                });
            }
            var XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
            function toSvgAsync(ws) {
                if (!ws)
                    return Promise.resolve(undefined);
                var metrics = ws.getBlocksBoundingBox();
                var sg = ws.getParentSvg().cloneNode(true);
                cleanUpBlocklySvg(sg);
                var width = metrics.right - metrics.left;
                var height = metrics.bottom - metrics.top;
                return blocklyToSvgAsync(sg, metrics.left, metrics.top, width, height);
            }
            layout.toSvgAsync = toSvgAsync;
            function serializeNode(sg) {
                return serializeSvgString(new XMLSerializer().serializeToString(sg));
            }
            layout.serializeNode = serializeNode;
            function serializeSvgString(xmlString) {
                return xmlString
                    .replace(new RegExp('&nbsp;', 'g'), '&#160;'); // Replace &nbsp; with &#160; as a workaround for having nbsp missing from SVG xml
            }
            layout.serializeSvgString = serializeSvgString;
            function cleanUpBlocklySvg(svg) {
                pxt.BrowserUtils.removeClass(svg, "blocklySvg");
                pxt.BrowserUtils.addClass(svg, "blocklyPreview pxt-renderer");
                // Remove background elements
                pxt.U.toArray(svg.querySelectorAll('.blocklyMainBackground,.blocklyScrollbarBackground'))
                    .forEach(function (el) { if (el)
                    el.parentNode.removeChild(el); });
                // Remove connection indicator elements
                pxt.U.toArray(svg.querySelectorAll('.blocklyConnectionIndicator,.blocklyInputConnectionIndicator'))
                    .forEach(function (el) { if (el)
                    el.parentNode.removeChild(el); });
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                pxt.U.toArray(svg.querySelectorAll('.blocklyBlockCanvas,.blocklyBubbleCanvas'))
                    .forEach(function (el) { return el.removeAttribute('transform'); });
                // In order to get the Blockly comment's text area to serialize properly they have to have names
                var parser = new DOMParser();
                pxt.U.toArray(svg.querySelectorAll('.blocklyCommentTextarea'))
                    .forEach(function (el) {
                    var dom = parser.parseFromString('<!doctype html><body>' + pxt.docs.html2Quote(el.value), 'text/html');
                    el.textContent = dom.body.textContent;
                });
                return svg;
            }
            layout.cleanUpBlocklySvg = cleanUpBlocklySvg;
            function blocklyToSvgAsync(sg, x, y, width, height) {
                if (!sg.childNodes[0])
                    return Promise.resolve(undefined);
                sg.removeAttribute("width");
                sg.removeAttribute("height");
                sg.removeAttribute("transform");
                var xmlString = serializeNode(sg)
                    .replace(/^\s*<svg[^>]+>/i, '')
                    .replace(/<\/svg>\s*$/i, ''); // strip out svg tag
                var svgXml = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"" + XLINK_NAMESPACE + "\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"" + x + " " + y + " " + width + " " + height + "\" class=\"pxt-renderer\">" + xmlString + "</svg>";
                var xsg = new DOMParser().parseFromString(svgXml, "image/svg+xml");
                var cssLink = xsg.createElementNS("http://www.w3.org/1999/xhtml", "style");
                var isRtl = pxt.Util.isUserLanguageRtl();
                var customCssHref = document.getElementById("style-" + (isRtl ? 'rtl' : '') + "blockly.css").href;
                var semanticCssHref = pxt.Util.toArray(document.head.getElementsByTagName("link"))
                    .filter(function (l) { return pxt.Util.endsWith(l.getAttribute("href"), "semantic.css"); })[0].href;
                return Promise.all([pxt.BrowserUtils.loadAjaxAsync(customCssHref), pxt.BrowserUtils.loadAjaxAsync(semanticCssHref)])
                    .then(function (customCss) {
                    var _a, _b;
                    var blocklySvg = pxt.Util.toArray(document.head.querySelectorAll("style"))
                        .filter(function (el) { return /\.blocklySvg/.test(el.innerText); })[0];
                    // Custom CSS injected directly into the DOM by Blockly
                    customCss.unshift(((_a = document.getElementById("blockly-common-style")) === null || _a === void 0 ? void 0 : _a.innerText) || "");
                    customCss.unshift(((_b = document.getElementById("blockly-renderer-style-pxt")) === null || _b === void 0 ? void 0 : _b.innerText) || "");
                    // CSS may contain <, > which need to be stored in CDATA section
                    var cssString = (blocklySvg ? blocklySvg.innerText : "") + '\n\n' + customCss.map(function (el) { return el + '\n\n'; });
                    cssLink.appendChild(xsg.createCDATASection(cssString));
                    xsg.documentElement.insertBefore(cssLink, xsg.documentElement.firstElementChild);
                    return expandImagesAsync(xsg)
                        .then(function () { return convertIconsToPngAsync(xsg); })
                        .then(function () {
                        return {
                            width: width,
                            height: height,
                            svg: serializeNode(xsg).replace('<style xmlns="http://www.w3.org/1999/xhtml">', '<style>'),
                            xml: documentToSvg(xsg),
                            css: cssString
                        };
                    });
                });
            }
            layout.blocklyToSvgAsync = blocklyToSvgAsync;
            function documentToSvg(xsg) {
                var xml = new XMLSerializer().serializeToString(xsg);
                var data = "data:image/svg+xml;base64," + ts.pxtc.encodeBase64(unescape(encodeURIComponent(xml)));
                return data;
            }
            layout.documentToSvg = documentToSvg;
            var imageXLinkCache;
            function expandImagesAsync(xsg) {
                if (!imageXLinkCache)
                    imageXLinkCache = {};
                var images = xsg.getElementsByTagName("image");
                var p = pxt.Util.toArray(images)
                    .filter(function (image) {
                    var href = image.getAttributeNS(XLINK_NAMESPACE, "href");
                    return href && !/^data:/.test(href);
                })
                    .map(function (img) { return img; })
                    .map(function (image) {
                    var href = image.getAttributeNS(XLINK_NAMESPACE, "href");
                    var dataUri = imageXLinkCache[href];
                    return (dataUri ? Promise.resolve(imageXLinkCache[href])
                        : pxt.BrowserUtils.loadImageAsync(image.getAttributeNS(XLINK_NAMESPACE, "href"))
                            .then(function (img) {
                            var cvs = document.createElement("canvas");
                            var ctx = cvs.getContext("2d");
                            var w = img.width;
                            var h = img.height;
                            cvs.width = w;
                            cvs.height = h;
                            ctx.drawImage(img, 0, 0, w, h, 0, 0, cvs.width, cvs.height);
                            imageXLinkCache[href] = dataUri = cvs.toDataURL("image/png");
                            return dataUri;
                        }).catch(function (e) {
                            // ignore load error
                            pxt.debug("svg render: failed to load " + href);
                        }))
                        .then(function (href) { image.setAttributeNS(XLINK_NAMESPACE, "href", href); });
                });
                return Promise.all(p).then(function () { });
            }
            var imageIconCache;
            function convertIconsToPngAsync(xsg) {
                if (!imageIconCache)
                    imageIconCache = {};
                if (!pxt.BrowserUtils.isEdge())
                    return Promise.resolve();
                var images = xsg.getElementsByTagName("image");
                var p = pxt.Util.toArray(images)
                    .filter(function (image) { return /^data:image\/svg\+xml/.test(image.getAttributeNS(XLINK_NAMESPACE, "href")); })
                    .map(function (img) { return img; })
                    .map(function (image) {
                    var svgUri = image.getAttributeNS(XLINK_NAMESPACE, "href");
                    var width = parseInt(image.getAttribute("width").replace(/[^0-9]/g, ""));
                    var height = parseInt(image.getAttribute("height").replace(/[^0-9]/g, ""));
                    var pngUri = imageIconCache[svgUri];
                    return (pngUri ? Promise.resolve(pngUri)
                        : toPngAsyncInternal(width, height, 4, svgUri))
                        .then(function (href) {
                        imageIconCache[svgUri] = href;
                        image.setAttributeNS(XLINK_NAMESPACE, "href", href);
                    });
                });
                return Promise.all(p).then(function () { });
            }
            function flowBlocks(comments, blocks, ratio, maxWidth) {
                if (ratio === void 0) { ratio = 1.62; }
                // Margin between blocks and their comments
                var innerGroupMargin = 13;
                // Margin between groups of blocks and comments
                var outerGroupMargin = 45;
                var groups = [];
                var commentMap = {};
                comments.forEach(function (comment) {
                    var ref = comment.data;
                    if (ref != undefined) {
                        commentMap[ref] = comment;
                    }
                    else {
                        groups.push(formattable(comment));
                    }
                });
                var onStart;
                blocks.forEach(function (block) {
                    var commentRefs = block.data;
                    if (commentRefs) {
                        var refs = commentRefs.split(";");
                        var children = [];
                        for (var i = 0; i < refs.length; i++) {
                            var comment = commentMap[refs[i]];
                            if (comment) {
                                children.push(formattable(comment));
                                delete commentMap[refs[i]];
                            }
                        }
                        if (children.length) {
                            groups.push({ value: block, width: -1, height: -1, children: children });
                            return;
                        }
                    }
                    var f = formattable(block);
                    if (!onStart && block.isEnabled() && block.type === pxtc.ON_START_TYPE) { // there might be duplicate on-start blocks
                        onStart = f;
                    }
                    else {
                        groups.push(f);
                    }
                });
                if (onStart) {
                    groups.unshift(onStart);
                }
                // Collect the comments that were not linked to a top-level block
                // and puth them in on start (if it exists)
                Object.keys(commentMap).sort(function (a, b) {
                    // These are strings of integers (eg "0", "17", etc.) with no duplicates
                    if (a.length === b.length) {
                        return a > b ? -1 : 1;
                    }
                    else {
                        return a.length > b.length ? -1 : 1;
                    }
                }).forEach(function (key) {
                    if (commentMap[key]) {
                        if (onStart) {
                            if (!onStart.children) {
                                onStart.children = [];
                            }
                            onStart.children.push(formattable(commentMap[key]));
                        }
                        else {
                            // Stick the comments in the front so that they show up in the top left
                            groups.unshift(formattable(commentMap[key]));
                        }
                    }
                });
                var surfaceArea = 0;
                for (var i = 0; i < groups.length; i++) {
                    var group = groups[i];
                    if (group.children) {
                        var valueDimensions = group.value.getHeightWidth();
                        group.x = 0;
                        group.y = 0;
                        var x = valueDimensions.width + innerGroupMargin;
                        var y = 0;
                        // Lay comments out to the right of the parent node
                        for (var j = 0; j < group.children.length; j++) {
                            var child = group.children[j];
                            child.x = x;
                            child.y = y;
                            y += child.height + innerGroupMargin;
                            group.width = Math.max(group.width, x + child.width);
                        }
                        group.height = Math.max(y - innerGroupMargin, valueDimensions.height);
                    }
                    surfaceArea += (group.height + innerGroupMargin) * (group.width + innerGroupMargin);
                }
                var maxx;
                if (maxWidth > marginx) {
                    maxx = maxWidth - marginx;
                }
                else {
                    maxx = Math.sqrt(surfaceArea) * ratio;
                }
                var insertx = marginx;
                var inserty = marginy;
                var rowBottom = 0;
                for (var i = 0; i < groups.length; i++) {
                    var group = groups[i];
                    if (group.children) {
                        moveFormattable(group, insertx + group.x, inserty + group.y);
                        for (var j = 0; j < group.children.length; j++) {
                            var child = group.children[j];
                            moveFormattable(child, insertx + child.x, inserty + child.y);
                        }
                    }
                    else {
                        moveFormattable(group, insertx, inserty);
                    }
                    insertx += group.width + outerGroupMargin;
                    rowBottom = Math.max(rowBottom, inserty + group.height + outerGroupMargin);
                    if (insertx > maxx) {
                        insertx = marginx;
                        inserty = rowBottom;
                    }
                }
                function moveFormattable(f, x, y) {
                    var bounds = f.value.getBoundingRectangle();
                    f.value.moveBy(x - bounds.left, y - bounds.top);
                }
            }
            function formattable(entity) {
                var hw = entity.getHeightWidth();
                return { value: entity, height: hw.height, width: hw.width };
            }
        })(layout = blocks_4.layout || (blocks_4.layout = {}));
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/blockly.d.ts" />
/// <reference path="../built/pxtlib.d.ts" />
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        var typeDefaults = {
            "string": {
                field: "TEXT",
                block: "text",
                defaultValue: ""
            },
            "number": {
                field: "NUM",
                block: "math_number",
                defaultValue: "0"
            },
            "boolean": {
                field: "BOOL",
                block: "logic_boolean",
                defaultValue: "false"
            },
            "Array": {
                field: "VAR",
                block: "variables_get",
                defaultValue: "list"
            }
        };
        // Add numbers before input names to prevent clashes with the ones added by BlocklyLoader
        blocks.optionalDummyInputPrefix = "0_optional_dummy";
        blocks.optionalInputWithFieldPrefix = "0_optional_field";
        // Matches arrays
        function isArrayType(type) {
            var arrayTypeRegex = /^(?:Array<(.+)>)|(?:(.+)\[\])|(?:\[.+\])$/;
            var parsed = arrayTypeRegex.exec(type);
            if (parsed) {
                // Is an array, returns what type it is an array of
                if (parsed[1]) {
                    // Is an array with form Array<type>
                    return parsed[1];
                }
                else {
                    // Is an array with form type[]
                    return parsed[2];
                }
            }
            else {
                // Not an array
                return undefined;
            }
        }
        blocks.isArrayType = isArrayType;
        // Matches tuples
        function isTupleType(type) {
            var tupleTypeRegex = /^\[(.+)\]$/;
            var parsed = tupleTypeRegex.exec(type);
            if (parsed) {
                // Returns an array containing the types of the tuple
                return parsed[1].split(/,\s*/);
            }
            else {
                // Not a tuple
                return undefined;
            }
        }
        blocks.isTupleType = isTupleType;
        var primitiveTypeRegex = /^(string|number|boolean)$/;
        // list of built-in blocks, should be touched.
        var _builtinBlocks;
        function builtinBlocks() {
            if (!_builtinBlocks) {
                _builtinBlocks = {};
                Object.keys(Blockly.Blocks)
                    .forEach(function (k) { return _builtinBlocks[k] = { block: Blockly.Blocks[k] }; });
            }
            return _builtinBlocks;
        }
        blocks.builtinBlocks = builtinBlocks;
        blocks.buildinBlockStatements = {
            "controls_if": true,
            "controls_for": true,
            "pxt_controls_for": true,
            "controls_simple_for": true,
            "controls_repeat_ext": true,
            "pxt_controls_for_of": true,
            "controls_for_of": true,
            "variables_set": true,
            "variables_change": true,
            "device_while": true
        };
        // Cached block info from the last inject operation
        var cachedBlockInfo;
        var cachedBlocks = {};
        function blockSymbol(type) {
            var b = cachedBlocks[type];
            return b ? b.fn : undefined;
        }
        blocks.blockSymbol = blockSymbol;
        function createShadowValue(info, p, shadowId, defaultV) {
            defaultV = defaultV || p.defaultValue;
            shadowId = shadowId || p.shadowBlockId;
            if (!shadowId && p.range)
                shadowId = "math_number_minmax";
            var defaultValue;
            if (defaultV && defaultV.slice(0, 1) == "\"")
                defaultValue = JSON.parse(defaultV);
            else {
                defaultValue = defaultV;
            }
            if (p.type == "number" && shadowId == "value") {
                var field = document.createElement("field");
                field.setAttribute("name", p.definitionName);
                field.appendChild(document.createTextNode("0"));
                return field;
            }
            var isVariable = shadowId == "variables_get";
            var isText = shadowId == "text";
            var value = document.createElement("value");
            value.setAttribute("name", p.definitionName);
            var isArray = isArrayType(p.type);
            var shadow = document.createElement(isVariable || isArray ? "block" : "shadow");
            value.appendChild(shadow);
            var typeInfo = typeDefaults[isArray || p.type];
            shadow.setAttribute("type", shadowId || (isArray ? 'lists_create_with' : typeInfo && typeInfo.block || p.type));
            shadow.setAttribute("colour", Blockly.Colours.textField);
            if (isArray) {
                // if an array of booleans, numbers, or strings
                if (typeInfo && !shadowId) {
                    var fieldValues = void 0;
                    switch (isArray) {
                        case "number":
                            fieldValues = ["0", "1"];
                            break;
                        case "string":
                            fieldValues = ["a", "b", "c"];
                            break;
                        case "boolean":
                            fieldValues = ["FALSE", "FALSE", "FALSE"];
                            break;
                    }
                    buildArrayShadow(shadow, typeInfo.block, typeInfo.field, fieldValues);
                    return value;
                }
                else if (shadowId && defaultValue) {
                    buildArrayShadow(shadow, defaultValue);
                    return value;
                }
            }
            if (typeInfo && (!shadowId || typeInfo.block === shadowId || shadowId === "math_number_minmax")) {
                var field = document.createElement("field");
                shadow.appendChild(field);
                var fieldName = void 0;
                switch (shadowId) {
                    case "variables_get":
                        fieldName = "VAR";
                        break;
                    case "math_number_minmax":
                        fieldName = "SLIDER";
                        break;
                    default:
                        fieldName = typeInfo.field;
                        break;
                }
                field.setAttribute("name", fieldName);
                var value_1;
                if (p.type == "boolean") {
                    value_1 = document.createTextNode((defaultValue || typeInfo.defaultValue).toUpperCase());
                }
                else {
                    value_1 = document.createTextNode(defaultValue || typeInfo.defaultValue);
                }
                field.appendChild(value_1);
            }
            else if (defaultValue) {
                var field = document.createElement("field");
                field.textContent = defaultValue;
                if (isVariable) {
                    field.setAttribute("name", "VAR");
                    shadow.appendChild(field);
                }
                else if (isText) {
                    field.setAttribute("name", "TEXT");
                    shadow.appendChild(field);
                }
                else if (shadowId) {
                    var shadowInfo = info.blocksById[shadowId];
                    if (shadowInfo && shadowInfo.attributes._def && shadowInfo.attributes._def.parameters.length) {
                        var shadowParam = shadowInfo.attributes._def.parameters[0];
                        field.setAttribute("name", shadowParam.name);
                        shadow.appendChild(field);
                    }
                }
                else {
                    field.setAttribute("name", p.definitionName);
                    shadow.appendChild(field);
                }
            }
            var mut;
            if (p.range) {
                mut = document.createElement('mutation');
                mut.setAttribute('min', p.range.min.toString());
                mut.setAttribute('max', p.range.max.toString());
                mut.setAttribute('label', p.actualName.charAt(0).toUpperCase() + p.actualName.slice(1));
                if (p.fieldOptions) {
                    if (p.fieldOptions['step'])
                        mut.setAttribute('step', p.fieldOptions['step']);
                    if (p.fieldOptions['color'])
                        mut.setAttribute('color', p.fieldOptions['color']);
                    if (p.fieldOptions['precision'])
                        mut.setAttribute('precision', p.fieldOptions['precision']);
                }
            }
            if (p.fieldOptions) {
                if (!mut)
                    mut = document.createElement('mutation');
                mut.setAttribute("customfield", JSON.stringify(p.fieldOptions));
            }
            if (mut) {
                shadow.appendChild(mut);
            }
            return value;
        }
        blocks.createShadowValue = createShadowValue;
        function buildArrayShadow(shadow, blockType, fieldName, fieldValues) {
            var itemCount = fieldValues ? fieldValues.length : 2;
            var mut = document.createElement('mutation');
            mut.setAttribute("items", "" + itemCount);
            shadow.appendChild(mut);
            for (var i = 0; i < itemCount; i++) {
                var innerValue = document.createElement("value");
                innerValue.setAttribute("name", "ADD" + i);
                var innerShadow = document.createElement("shadow");
                innerShadow.setAttribute("type", blockType);
                if (fieldName) {
                    var field = document.createElement("field");
                    field.setAttribute("name", fieldName);
                    if (fieldValues) {
                        field.appendChild(document.createTextNode(fieldValues[i]));
                    }
                    innerShadow.appendChild(field);
                }
                innerValue.appendChild(innerShadow);
                shadow.appendChild(innerValue);
            }
        }
        function createFlyoutHeadingLabel(name, color, icon, iconClass) {
            var headingLabel = createFlyoutLabel(name, pxt.toolbox.convertColor(color), icon, iconClass);
            headingLabel.setAttribute('web-class', 'blocklyFlyoutHeading');
            return headingLabel;
        }
        blocks.createFlyoutHeadingLabel = createFlyoutHeadingLabel;
        function createFlyoutGroupLabel(name, icon, labelLineWidth, helpCallback) {
            var groupLabel = createFlyoutLabel(name, undefined, icon);
            groupLabel.setAttribute('web-class', 'blocklyFlyoutGroup');
            groupLabel.setAttribute('web-line', '1.5');
            if (labelLineWidth)
                groupLabel.setAttribute('web-line-width', labelLineWidth);
            if (helpCallback) {
                groupLabel.setAttribute('web-help-button', 'true');
                groupLabel.setAttribute('callbackKey', helpCallback);
            }
            return groupLabel;
        }
        blocks.createFlyoutGroupLabel = createFlyoutGroupLabel;
        function createFlyoutLabel(name, color, icon, iconClass) {
            // Add the Heading label
            var headingLabel = Blockly.utils.xml.createElement('label');
            headingLabel.setAttribute('text', name);
            if (color) {
                headingLabel.setAttribute('web-icon-color', pxt.toolbox.convertColor(color));
            }
            if (icon) {
                if (icon.length === 1) {
                    headingLabel.setAttribute('web-icon', icon);
                    if (iconClass)
                        headingLabel.setAttribute('web-icon-class', iconClass);
                }
                else {
                    headingLabel.setAttribute('web-icon-class', "blocklyFlyoutIcon" + name);
                }
            }
            return headingLabel;
        }
        function createFlyoutButton(callbackKey, label) {
            var button = Blockly.utils.xml.createElement('button');
            button.setAttribute('text', label);
            button.setAttribute('callbackKey', callbackKey);
            return button;
        }
        blocks.createFlyoutButton = createFlyoutButton;
        function createToolboxBlock(info, fn, comp) {
            //
            // toolbox update
            //
            var block = document.createElement("block");
            block.setAttribute("type", fn.attributes.blockId);
            if (fn.attributes.blockGap)
                block.setAttribute("gap", fn.attributes.blockGap);
            else if (pxt.appTarget.appTheme && pxt.appTarget.appTheme.defaultBlockGap)
                block.setAttribute("gap", pxt.appTarget.appTheme.defaultBlockGap.toString());
            if (comp.thisParameter) {
                var t = comp.thisParameter;
                block.appendChild(createShadowValue(info, t, t.shadowBlockId || "variables_get", t.defaultValue || t.definitionName));
            }
            if (fn.parameters) {
                comp.parameters.filter(function (pr) { return !pr.isOptional &&
                    (primitiveTypeRegex.test(pr.type)
                        || primitiveTypeRegex.test(isArrayType(pr.type))
                        || pr.shadowBlockId
                        || pr.defaultValue); })
                    .forEach(function (pr) {
                    block.appendChild(createShadowValue(info, pr));
                });
                if (fn.attributes.draggableParameters) {
                    comp.handlerArgs.forEach(function (arg) {
                        // draggableParameters="variable":
                        // <value name="HANDLER_DRAG_PARAM_arg">
                        // <shadow type="variables_get_reporter">
                        //     <field name="VAR">defaultName</field>
                        // </shadow>
                        // </value>
                        // draggableParameters="reporter"
                        // <value name="HANDLER_DRAG_PARAM_arg">
                        //     <shadow type="argument_reporter_custom">
                        //         <mutation typename="Sprite"></mutation>
                        //         <field name="VALUE">mySprite</field>
                        //     </shadow>
                        // </value>
                        var useReporter = fn.attributes.draggableParameters === "reporter";
                        var value = document.createElement("value");
                        value.setAttribute("name", "HANDLER_DRAG_PARAM_" + arg.name);
                        var blockType = useReporter ? pxt.blocks.reporterTypeForArgType(arg.type) : "variables_get_reporter";
                        var shadow = document.createElement("shadow");
                        shadow.setAttribute("type", blockType);
                        if (useReporter && blockType === "argument_reporter_custom") {
                            var mutation = document.createElement("mutation");
                            mutation.setAttribute("typename", arg.type);
                            shadow.appendChild(mutation);
                        }
                        var field = document.createElement("field");
                        field.setAttribute("name", useReporter ? "VALUE" : "VAR");
                        field.textContent = pxt.Util.htmlEscape(arg.name);
                        shadow.appendChild(field);
                        value.appendChild(shadow);
                        block.appendChild(value);
                    });
                }
                else {
                    comp.handlerArgs.forEach(function (arg) {
                        var field = document.createElement("field");
                        field.setAttribute("name", "HANDLER_" + arg.name);
                        field.textContent = arg.name;
                        block.appendChild(field);
                    });
                }
            }
            return block;
        }
        blocks.createToolboxBlock = createToolboxBlock;
        function injectBlocks(blockInfo) {
            cachedBlockInfo = blockInfo;
            Blockly.pxtBlocklyUtils.whitelistDraggableBlockTypes(blockInfo.blocks.filter(function (fn) { return fn.attributes.duplicateShadowOnDrag; }).map(function (fn) { return fn.attributes.blockId; }));
            // inject Blockly with all block definitions
            return blockInfo.blocks
                .map(function (fn) {
                if (fn.attributes.blockBuiltin) {
                    pxt.Util.assert(!!builtinBlocks()[fn.attributes.blockId]);
                    builtinBlocks()[fn.attributes.blockId].symbol = fn;
                }
                else {
                    var comp = blocks.compileInfo(fn);
                    var block = createToolboxBlock(blockInfo, fn, comp);
                    injectBlockDefinition(blockInfo, fn, comp, block);
                }
                return fn;
            });
        }
        blocks.injectBlocks = injectBlocks;
        function injectBlockDefinition(info, fn, comp, blockXml) {
            var id = fn.attributes.blockId;
            if (builtinBlocks()[id]) {
                pxt.reportError("blocks", 'trying to override builtin block', { "details": id });
                return false;
            }
            var hash = JSON.stringify(fn);
            /* tslint:disable:possible-timing-attack (not a security critical codepath) */
            if (cachedBlocks[id] && cachedBlocks[id].hash == hash) {
                return true;
            }
            /* tslint:enable:possible-timing-attack */
            if (Blockly.Blocks[fn.attributes.blockId]) {
                console.error("duplicate block definition: " + id);
                return false;
            }
            var cachedBlock = {
                hash: hash,
                fn: fn,
                block: {
                    codeCard: mkCard(fn, blockXml),
                    init: function () { initBlock(this, info, fn, comp); }
                }
            };
            if (pxt.Util.isTranslationMode()
                && pxt.blocks.promptTranslateBlock) {
                cachedBlock.block.customContextMenu = function (options) {
                    if (fn.attributes.translationId) {
                        options.push({
                            enabled: true,
                            text: lf("Translate this block"),
                            callback: function () {
                                pxt.blocks.promptTranslateBlock(id, [fn.attributes.translationId]);
                            }
                        });
                    }
                };
            }
            cachedBlocks[id] = cachedBlock;
            Blockly.Blocks[id] = cachedBlock.block;
            return true;
        }
        function newLabel(part) {
            if (part.kind === "image") {
                return iconToFieldImage(part.uri);
            }
            var txt = removeOuterSpace(part.text);
            if (!txt) {
                return undefined;
            }
            if (part.cssClass) {
                return new Blockly.FieldLabel(txt, part.cssClass);
            }
            else if (part.style.length) {
                return new pxtblockly.FieldStyledLabel(txt, {
                    bold: part.style.indexOf("bold") !== -1,
                    italics: part.style.indexOf("italics") !== -1,
                    blocksInfo: undefined
                });
            }
            else {
                return new Blockly.FieldLabel(txt, undefined);
            }
        }
        function cleanOuterHTML(el) {
            // remove IE11 junk
            return el.outerHTML.replace(/^<\?[^>]*>/, '');
        }
        function mkCard(fn, blockXml) {
            return {
                name: fn.namespace + '.' + fn.name,
                shortName: fn.name,
                description: fn.attributes.jsDoc,
                url: fn.attributes.help ? 'reference/' + fn.attributes.help.replace(/^\//, '') : undefined,
                blocksXml: "<xml xmlns=\"http://www.w3.org/1999/xhtml\">" + cleanOuterHTML(blockXml) + "</xml>",
            };
        }
        function isSubtype(apis, specific, general) {
            if (specific == general)
                return true;
            var inf = apis.byQName[specific];
            if (inf && inf.extendsTypes)
                return inf.extendsTypes.indexOf(general) >= 0;
            return false;
        }
        function initBlock(block, info, fn, comp) {
            var ns = (fn.attributes.blockNamespace || fn.namespace).split('.')[0];
            var instance = fn.kind == 1 /* Method */ || fn.kind == 2 /* Property */;
            var nsinfo = info.apis.byQName[ns];
            var color = 
            // blockNamespace overrides color on block
            (fn.attributes.blockNamespace && nsinfo && nsinfo.attributes.color)
                || fn.attributes.color
                || (nsinfo && nsinfo.attributes.color)
                || pxt.toolbox.getNamespaceColor(ns)
                || 255;
            if (fn.attributes.help) {
                var helpUrl = fn.attributes.help.replace(/^\//, '');
                if (/^github:/.test(helpUrl)) {
                    block.setHelpUrl(helpUrl);
                }
                else if (helpUrl !== "none") {
                    block.setHelpUrl("/reference/" + helpUrl);
                }
            }
            else if (fn.pkg && !pxt.appTarget.bundledpkgs[fn.pkg]) { // added package
                var anchor = fn.qName.toLowerCase().split('.');
                if (anchor[0] == fn.pkg)
                    anchor.shift();
                block.setHelpUrl("/pkg/" + fn.pkg + "#" + encodeURIComponent(anchor.join('-')));
            }
            block.setColour(color);
            var blockShape = Blockly.OUTPUT_SHAPE_ROUND;
            if (fn.retType == "boolean")
                blockShape = Blockly.OUTPUT_SHAPE_HEXAGONAL;
            block.setOutputShape(blockShape);
            if (fn.attributes.undeletable)
                block.setDeletable(false);
            buildBlockFromDef(fn.attributes._def);
            var hasHandler = false;
            if (fn.attributes.mutate) {
                blocks.addMutation(block, fn, fn.attributes.mutate);
            }
            else if (fn.attributes.defaultInstance) {
                blocks.addMutation(block, fn, blocks.MutatorTypes.DefaultInstanceMutator);
            }
            else if (fn.attributes._expandedDef && fn.attributes.expandableArgumentMode !== "disabled") {
                var shouldToggle = fn.attributes.expandableArgumentMode === "toggle";
                blocks.initExpandableBlock(info, block, fn.attributes._expandedDef, comp, shouldToggle, function () { return buildBlockFromDef(fn.attributes._expandedDef, true); });
            }
            else if (comp.handlerArgs.length) {
                /**
                 * We support four modes for handler parameters: variable dropdowns,
                 * expandable variable dropdowns with +/- buttons (used for chat commands),
                 * draggable variable blocks, and draggable reporter blocks.
                 */
                hasHandler = true;
                if (fn.attributes.optionalVariableArgs) {
                    blocks.initVariableArgsBlock(block, comp.handlerArgs);
                }
                else if (fn.attributes.draggableParameters) {
                    comp.handlerArgs.filter(function (a) { return !a.inBlockDef; }).forEach(function (arg) {
                        var i = block.appendValueInput("HANDLER_DRAG_PARAM_" + arg.name);
                        if (fn.attributes.draggableParameters == "reporter") {
                            i.setCheck(getBlocklyCheckForType(arg.type, info));
                        }
                        else {
                            i.setCheck("Variable");
                        }
                    });
                }
                else {
                    var i_2 = block.appendDummyInput();
                    comp.handlerArgs.filter(function (a) { return !a.inBlockDef; }).forEach(function (arg) {
                        i_2.appendField(new Blockly.FieldVariable(arg.name), "HANDLER_" + arg.name);
                    });
                }
            }
            // Add mutation to save and restore custom field settings
            blocks.appendMutation(block, {
                mutationToDom: function (el) {
                    block.inputList.forEach(function (input) {
                        input.fieldRow.forEach(function (fieldRow) {
                            if (fieldRow.isFieldCustom_ && fieldRow.saveOptions) {
                                var getOptions = fieldRow.saveOptions();
                                if (getOptions) {
                                    el.setAttribute("customfield", JSON.stringify(getOptions));
                                }
                            }
                        });
                    });
                    return el;
                },
                domToMutation: function (saved) {
                    block.inputList.forEach(function (input) {
                        input.fieldRow.forEach(function (fieldRow) {
                            if (fieldRow.isFieldCustom_ && fieldRow.restoreOptions) {
                                var options_1 = JSON.parse(saved.getAttribute("customfield"));
                                if (options_1) {
                                    fieldRow.restoreOptions(options_1);
                                }
                            }
                        });
                    });
                }
            });
            if (fn.attributes.imageLiteral) {
                var columns = (fn.attributes.imageLiteralColumns || 5) * fn.attributes.imageLiteral;
                var rows = fn.attributes.imageLiteralRows || 5;
                var scale = fn.attributes.imageLiteralScale;
                var ri = block.appendDummyInput();
                ri.appendField(new pxtblockly.FieldMatrix("", { columns: columns, rows: rows, scale: scale }), "LEDS");
            }
            if (fn.attributes.inlineInputMode === "external") {
                block.setInputsInline(false);
            }
            else if (fn.attributes.inlineInputMode === "inline") {
                block.setInputsInline(true);
            }
            else {
                block.setInputsInline(!fn.parameters || (fn.parameters.length < 4 && !fn.attributes.imageLiteral));
            }
            var body = fn.parameters ? fn.parameters.filter(function (pr) { return pr.type == "() => void" || pr.type == "Action"; })[0] : undefined;
            if (body || hasHandler) {
                block.appendStatementInput("HANDLER")
                    .setCheck(null);
                block.setInputsInline(true);
            }
            setOutputCheck(block, fn.retType, info);
            // hook up/down if return value is void
            var hasHandlers = hasArrowFunction(fn);
            block.setPreviousStatement(!(hasHandlers && !fn.attributes.handlerStatement) && fn.retType == "void");
            block.setNextStatement(!(hasHandlers && !fn.attributes.handlerStatement) && fn.retType == "void");
            block.setTooltip(/^__/.test(fn.namespace) ? "" : fn.attributes.jsDoc);
            function buildBlockFromDef(def, expanded) {
                if (expanded === void 0) { expanded = false; }
                var anonIndex = 0;
                var firstParam = !expanded && !!comp.thisParameter;
                var inputs = splitInputs(def);
                var imgConv = new pxt.ImageConverter();
                if (fn.attributes.shim === "ENUM_GET" || fn.attributes.shim === "KIND_GET") {
                    if (comp.parameters.length > 1 || comp.thisParameter) {
                        console.warn("Enum blocks may only have 1 parameter but " + fn.attributes.blockId + " has " + comp.parameters.length);
                        return;
                    }
                }
                inputs.forEach(function (inputParts) {
                    var fields = [];
                    var inputName;
                    var inputCheck;
                    var hasParameter = false;
                    inputParts.forEach(function (part) {
                        if (part.kind !== "param") {
                            var f = newLabel(part);
                            if (f) {
                                fields.push({ field: f });
                            }
                        }
                        else if (fn.attributes.shim === "ENUM_GET") {
                            pxt.U.assert(!!fn.attributes.enumName, "Trying to create an ENUM_GET block without a valid enum name");
                            fields.push({
                                name: "MEMBER",
                                field: new pxtblockly.FieldUserEnum(info.enumsByName[fn.attributes.enumName])
                            });
                            return;
                        }
                        else if (fn.attributes.shim === "KIND_GET") {
                            fields.push({
                                name: "MEMBER",
                                field: new pxtblockly.FieldKind(info.kindsByName[fn.attributes.kindNamespace || fn.attributes.blockNamespace || fn.namespace])
                            });
                            return;
                        }
                        else {
                            // find argument
                            var pr_1 = getParameterFromDef(part, comp, firstParam);
                            firstParam = false;
                            if (!pr_1) {
                                console.error("block " + fn.attributes.blockId + ": unknown parameter " + part.name + (part.ref ? " (" + part.ref + ")" : ""));
                                return;
                            }
                            if (isHandlerArg(pr_1)) {
                                inputName = "HANDLER_DRAG_PARAM_" + pr_1.name;
                                inputCheck = fn.attributes.draggableParameters === "reporter" ? getBlocklyCheckForType(pr_1.type, info) : "Variable";
                                return;
                            }
                            var typeInfo = pxt.U.lookup(info.apis.byQName, pr_1.type);
                            hasParameter = true;
                            var defName = pr_1.definitionName;
                            var actName = pr_1.actualName;
                            var isEnum = typeInfo && typeInfo.kind == 6 /* Enum */;
                            var isFixed = typeInfo && !!typeInfo.attributes.fixedInstances && !pr_1.shadowBlockId;
                            var isConstantShim = !!fn.attributes.constantShim;
                            var isCombined = pr_1.type == "@combined@";
                            var customField = pr_1.fieldEditor;
                            var fieldLabel = defName.charAt(0).toUpperCase() + defName.slice(1);
                            var fieldType = pr_1.type;
                            if (isEnum || isFixed || isConstantShim || isCombined) {
                                var syms = void 0;
                                if (isEnum) {
                                    syms = getEnumDropdownValues(info.apis, pr_1.type);
                                }
                                else if (isFixed) {
                                    syms = getFixedInstanceDropdownValues(info.apis, typeInfo.qName);
                                }
                                else if (isCombined) {
                                    syms = fn.combinedProperties.map(function (p) { return pxt.U.lookup(info.apis.byQName, p); });
                                }
                                else {
                                    syms = getConstantDropdownValues(info.apis, fn.qName);
                                }
                                if (syms.length == 0) {
                                    console.error("no instances of " + typeInfo.qName + " found");
                                }
                                var dd = syms.map(function (v) {
                                    var k = v.attributes.block || v.attributes.blockId || v.name;
                                    var comb = v.attributes.blockCombine;
                                    if (v.attributes.jresURL && !v.attributes.iconURL && pxt.U.startsWith(v.attributes.jresURL, "data:image/x-mkcd-f")) {
                                        v.attributes.iconURL = imgConv.convert(v.attributes.jresURL);
                                    }
                                    if (!!comb)
                                        k = k.replace(/@set/, "");
                                    return [
                                        v.attributes.iconURL || v.attributes.blockImage ? {
                                            src: v.attributes.iconURL || pxt.Util.pathJoin(pxt.webConfig.commitCdnUrl, "blocks/" + v.namespace.toLowerCase() + "/" + v.name.toLowerCase() + ".png"),
                                            alt: k,
                                            width: 36,
                                            height: 36,
                                            value: v.name
                                        } : k,
                                        v.namespace + "." + v.name
                                    ];
                                });
                                // if a value is provided, move it first
                                if (pr_1.defaultValue) {
                                    var shadowValueIndex_1 = -1;
                                    dd.some(function (v, i) {
                                        if (v[1] === pr_1.defaultValue) {
                                            shadowValueIndex_1 = i;
                                            return true;
                                        }
                                        return false;
                                    });
                                    if (shadowValueIndex_1 > -1) {
                                        var shadowValue = dd.splice(shadowValueIndex_1, 1)[0];
                                        dd.unshift(shadowValue);
                                    }
                                }
                                if (customField) {
                                    var defl = fn.attributes.paramDefl[actName] || "";
                                    var options_2 = {
                                        data: dd,
                                        colour: color,
                                        label: fieldLabel,
                                        type: fieldType,
                                        blocksInfo: info
                                    };
                                    pxt.Util.jsonMergeFrom(options_2, fn.attributes.paramFieldEditorOptions && fn.attributes.paramFieldEditorOptions[actName] || {});
                                    fields.push(namedField(blocks.createFieldEditor(customField, defl, options_2), defName));
                                }
                                else
                                    fields.push(namedField(new Blockly.FieldDropdown(dd), defName));
                            }
                            else if (customField) {
                                var defl = fn.attributes.paramDefl[pr_1.actualName] || "";
                                var options_3 = {
                                    colour: color,
                                    label: fieldLabel,
                                    type: fieldType,
                                    blocksInfo: info
                                };
                                pxt.Util.jsonMergeFrom(options_3, fn.attributes.paramFieldEditorOptions && fn.attributes.paramFieldEditorOptions[pr_1.actualName] || {});
                                fields.push(namedField(blocks.createFieldEditor(customField, defl, options_3), pr_1.definitionName));
                            }
                            else {
                                inputName = defName;
                                if (instance && part.name === "this") {
                                    inputCheck = pr_1.type;
                                }
                                else if (pr_1.type == "number" && pr_1.shadowBlockId && pr_1.shadowBlockId == "value") {
                                    inputName = undefined;
                                    fields.push(namedField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), defName));
                                }
                                else if (pr_1.type == "string" && pr_1.shadowOptions && pr_1.shadowOptions.toString) {
                                    inputCheck = null;
                                }
                                else {
                                    inputCheck = getBlocklyCheckForType(pr_1.type, info);
                                }
                            }
                        }
                    });
                    var input;
                    if (inputName) {
                        input = block.appendValueInput(inputName);
                        input.setAlign(Blockly.ALIGN_LEFT);
                    }
                    else if (expanded) {
                        var prefix = hasParameter ? blocks.optionalInputWithFieldPrefix : blocks.optionalDummyInputPrefix;
                        input = block.appendDummyInput(prefix + (anonIndex++));
                    }
                    else {
                        input = block.appendDummyInput();
                    }
                    if (inputCheck) {
                        input.setCheck(inputCheck);
                    }
                    fields.forEach(function (f) { return input.appendField(f.field, f.name); });
                });
                imgConv.logTime();
            }
        }
        function getParameterFromDef(part, comp, isThis) {
            if (isThis === void 0) { isThis = false; }
            if (part.ref) {
                var result = (part.name === "this") ? comp.thisParameter : comp.actualNameToParam[part.name];
                if (!result) {
                    var ha_1;
                    comp.handlerArgs.forEach(function (arg) {
                        if (arg.name === part.name)
                            ha_1 = arg;
                    });
                    if (ha_1)
                        return ha_1;
                }
                return result;
            }
            else {
                return isThis ? comp.thisParameter : comp.definitionNameToParam[part.name];
            }
        }
        function isHandlerArg(arg) {
            return !arg.definitionName;
        }
        function hasArrowFunction(fn) {
            var r = fn.parameters
                ? fn.parameters.filter(function (pr) { return pr.type === "Action" || /^\([^\)]*\)\s*=>/.test(pr.type); })[0]
                : undefined;
            return !!r;
        }
        blocks.hasArrowFunction = hasArrowFunction;
        function cleanBlocks() {
            pxt.debug('removing all custom blocks');
            for (var b in cachedBlocks)
                removeBlock(cachedBlocks[b].fn);
        }
        blocks.cleanBlocks = cleanBlocks;
        /**
         * Used by pxtrunner to initialize blocks in the docs
         */
        function initializeAndInject(blockInfo) {
            init();
            injectBlocks(blockInfo);
        }
        blocks.initializeAndInject = initializeAndInject;
        /**
         * Used by main app to initialize blockly blocks.
         * Blocks are injected separately by called injectBlocks
         */
        function initialize(blockInfo) {
            init();
            initJresIcons(blockInfo);
        }
        blocks.initialize = initialize;
        var blocklyInitialized = false;
        function init() {
            if (blocklyInitialized)
                return;
            blocklyInitialized = true;
            goog.provide('Blockly.Blocks.device');
            goog.require('Blockly.Blocks');
            Blockly.FieldCheckbox.CHECK_CHAR = '■';
            Blockly.Constants.ADD_START_HATS = !!pxt.appTarget.appTheme.blockHats;
            blocks.initFieldEditors();
            initContextMenu();
            initOnStart();
            initMath();
            initVariables();
            initFunctions();
            initLists();
            initLoops();
            initLogic();
            initText();
            initDrag();
            initDebugger();
            initComments();
            initTooltip();
            // PXT is in charge of disabling, don't record undo for disabled events
            Blockly.Block.prototype.setEnabled = function (enabled) {
                if (this.disabled == enabled) {
                    var oldRecordUndo = Blockly.Events.recordUndo;
                    Blockly.Events.recordUndo = false;
                    Blockly.Events.fire(new Blockly.Events.BlockChange(this, 'disabled', null, this.disabled, !enabled));
                    Blockly.Events.recordUndo = oldRecordUndo;
                    this.disabled = !enabled;
                }
            };
        }
        /**
         * Converts a TypeScript type into an array of type checks for Blockly inputs/outputs. Use
         * with block.setOutput() and input.setCheck().
         *
         * @returns An array of checks if the type is valid, undefined if there are no valid checks
         *      (e.g. type is void), and null if all checks should be accepted (e.g. type is generic)
         */
        function getBlocklyCheckForType(type, info) {
            var types = type.split(/\s*\|\s*/);
            var output = [];
            for (var _i = 0, types_1 = types; _i < types_1.length; _i++) {
                var subtype = types_1[_i];
                switch (subtype) {
                    // Blockly capitalizes primitive types for its builtin math/string/logic blocks
                    case "number":
                        output.push("Number");
                        break;
                    case "string":
                        output.push("String");
                        break;
                    case "boolean":
                        output.push("Boolean");
                        break;
                    case "T":
                    // The type is generic, so accept any checks. This is mostly used with functions that
                    // get values from arrays. This could be improved if we ever add proper type
                    // inference for generic types
                    case "any":
                        return null;
                    case "void":
                        return undefined;
                    default:
                        // We add "Array" to the front for array types so that they can be connected
                        // to the blocks that accept any array (e.g. length, push, pop, etc)
                        if (isArrayType(subtype)) {
                            if (types.length > 1) {
                                // type inference will potentially break non-trivial arrays in intersections
                                // until we have better type handling in blocks,
                                // so escape and allow any block to be dropped in.
                                return null;
                            }
                            else {
                                output.push("Array");
                            }
                        }
                        // Blockly has no concept of inheritance, so we need to add all
                        // super classes to the check array
                        var si_r = info.apis.byQName[subtype];
                        if (si_r && si_r.extendsTypes && 0 < si_r.extendsTypes.length) {
                            output.push.apply(output, si_r.extendsTypes);
                        }
                        else {
                            output.push(subtype);
                        }
                }
            }
            return output;
        }
        function setOutputCheck(block, retType, info) {
            var check = getBlocklyCheckForType(retType, info);
            if (check || check === null) {
                block.setOutput(true, check);
            }
        }
        function setBuiltinHelpInfo(block, id) {
            var info = pxt.blocks.getBlockDefinition(id);
            setHelpResources(block, id, info.name, info.tooltip, info.url, pxt.toolbox.getNamespaceColor(info.category));
        }
        function installBuiltinHelpInfo(id) {
            var info = pxt.blocks.getBlockDefinition(id);
            installHelpResources(id, info.name, info.tooltip, info.url, pxt.toolbox.getNamespaceColor(info.category));
        }
        function setHelpResources(block, id, name, tooltip, url, colour, colourSecondary, colourTertiary, undeletable) {
            if (tooltip && (typeof tooltip === "string" || typeof tooltip === "function"))
                block.setTooltip(tooltip);
            if (url)
                block.setHelpUrl(url);
            if (colour)
                block.setColour(colour, colourSecondary, colourTertiary);
            if (undeletable)
                block.setDeletable(false);
            var tb = document.getElementById('blocklyToolboxDefinition');
            var xml = tb ? blocks.getFirstChildWithAttr(tb, "block", "type", id) : undefined;
            block.codeCard = {
                header: name,
                name: name,
                software: 1,
                description: goog.isFunction(tooltip) ? tooltip(block) : tooltip,
                blocksXml: xml ? ("<xml xmlns=\"http://www.w3.org/1999/xhtml\">" + (cleanOuterHTML(xml) || "<block type=\"" + id + "\"></block>") + "</xml>") : undefined,
                url: url
            };
            if (pxt.Util.isTranslationMode()
                && pxt.blocks.promptTranslateBlock) {
                block.customContextMenu = function (options) {
                    var blockd = pxt.blocks.getBlockDefinition(block.type);
                    if (blockd && blockd.translationIds) {
                        options.push({
                            enabled: true,
                            text: lf("Translate this block"),
                            callback: function () {
                                pxt.blocks.promptTranslateBlock(id, blockd.translationIds);
                            }
                        });
                    }
                };
            }
        }
        function installHelpResources(id, name, tooltip, url, colour, colourSecondary, colourTertiary) {
            var block = Blockly.Blocks[id];
            var old = block.init;
            if (!old)
                return;
            block.init = function () {
                old.call(this);
                var block = this;
                setHelpResources(this, id, name, tooltip, url, colour, colourSecondary, colourTertiary);
            };
        }
        blocks.installHelpResources = installHelpResources;
        function initLists() {
            var msg = Blockly.Msg;
            // lists_create_with
            var listsCreateWithId = "lists_create_with";
            var listsCreateWithDef = pxt.blocks.getBlockDefinition(listsCreateWithId);
            msg.LISTS_CREATE_EMPTY_TITLE = listsCreateWithDef.block["LISTS_CREATE_EMPTY_TITLE"];
            msg.LISTS_CREATE_WITH_INPUT_WITH = listsCreateWithDef.block["LISTS_CREATE_WITH_INPUT_WITH"];
            msg.LISTS_CREATE_WITH_CONTAINER_TITLE_ADD = listsCreateWithDef.block["LISTS_CREATE_WITH_CONTAINER_TITLE_ADD"];
            msg.LISTS_CREATE_WITH_ITEM_TITLE = listsCreateWithDef.block["LISTS_CREATE_WITH_ITEM_TITLE"];
            installBuiltinHelpInfo(listsCreateWithId);
            // lists_length
            var listsLengthId = "lists_length";
            var listsLengthDef = pxt.blocks.getBlockDefinition(listsLengthId);
            msg.LISTS_LENGTH_TITLE = listsLengthDef.block["LISTS_LENGTH_TITLE"];
            // We have to override this block definition because the builtin block
            // allows both Strings and Arrays in its input check and that confuses
            // our Blockly compiler
            var block = Blockly.Blocks[listsLengthId];
            block.init = function () {
                this.jsonInit({
                    "message0": msg.LISTS_LENGTH_TITLE,
                    "args0": [
                        {
                            "type": "input_value",
                            "name": "VALUE",
                            "check": ['Array']
                        }
                    ],
                    "output": 'Number',
                    "outputShape": Blockly.OUTPUT_SHAPE_ROUND
                });
            };
            installBuiltinHelpInfo(listsLengthId);
        }
        function initLoops() {
            var msg = Blockly.Msg;
            // controls_repeat_ext
            var controlsRepeatExtId = "controls_repeat_ext";
            var controlsRepeatExtDef = pxt.blocks.getBlockDefinition(controlsRepeatExtId);
            msg.CONTROLS_REPEAT_TITLE = controlsRepeatExtDef.block["CONTROLS_REPEAT_TITLE"];
            msg.CONTROLS_REPEAT_INPUT_DO = controlsRepeatExtDef.block["CONTROLS_REPEAT_INPUT_DO"];
            installBuiltinHelpInfo(controlsRepeatExtId);
            // device_while
            var deviceWhileId = "device_while";
            var deviceWhileDef = pxt.blocks.getBlockDefinition(deviceWhileId);
            Blockly.Blocks[deviceWhileId] = {
                init: function () {
                    this.jsonInit({
                        "message0": deviceWhileDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "COND",
                                "check": "Boolean"
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.getNamespaceColor('loops')
                    });
                    this.appendStatementInput("DO")
                        .appendField(deviceWhileDef.block["appendField"]);
                    setBuiltinHelpInfo(this, deviceWhileId);
                }
            };
            // pxt_controls_for
            var pxtControlsForId = "pxt_controls_for";
            var pxtControlsForDef = pxt.blocks.getBlockDefinition(pxtControlsForId);
            Blockly.Blocks[pxtControlsForId] = {
                /**
                 * Block for 'for' loop.
                 * @this Blockly.Block
                 */
                init: function () {
                    this.jsonInit({
                        "message0": pxtControlsForDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "VAR",
                                "variable": pxtControlsForDef.block["variable"],
                                "check": "Variable"
                            },
                            {
                                "type": "input_value",
                                "name": "TO",
                                "check": "Number"
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.getNamespaceColor('loops'),
                        "inputsInline": true
                    });
                    this.appendStatementInput('DO')
                        .appendField(pxtControlsForDef.block["appendField"]);
                    var thisBlock = this;
                    setHelpResources(this, pxtControlsForId, pxtControlsForDef.name, function () {
                        return pxt.U.rlf(pxtControlsForDef.tooltip, thisBlock.getInputTargetBlock('VAR') ? thisBlock.getInputTargetBlock('VAR').getField('VAR').getText() : '');
                    }, pxtControlsForDef.url, String(pxt.toolbox.getNamespaceColor('loops')));
                },
                /**
                 * Return all variables referenced by this block.
                 * @return {!Array.<string>} List of variable names.
                 * @this Blockly.Block
                 */
                getVars: function () {
                    return [this.getField('VAR').getText()];
                },
                /**
                 * Notification that a variable is renaming.
                 * If the name matches one of this block's variables, rename it.
                 * @param {string} oldName Previous name of variable.
                 * @param {string} newName Renamed variable.
                 * @this Blockly.Block
                 */
                renameVar: function (oldName, newName) {
                    var varField = this.getField('VAR');
                    if (Blockly.Names.equals(oldName, varField.getText())) {
                        varField.setValue(newName);
                    }
                },
                /**
                 * Add menu option to create getter block for loop variable.
                 * @param {!Array} options List of menu options to add to.
                 * @this Blockly.Block
                 */
                customContextMenu: function (options) {
                    if (!this.isCollapsed()) {
                        var option = { enabled: true };
                        option.text = lf("Create 'get {0}'", name);
                        var xmlField = goog.dom.createDom('field', null, name);
                        xmlField.setAttribute('name', 'VAR');
                        var xmlBlock = goog.dom.createDom('block', null, xmlField);
                        xmlBlock.setAttribute('type', 'variables_get');
                        option.callback = Blockly.ContextMenu.callbackFactory(this, xmlBlock);
                        options.push(option);
                    }
                }
            };
            // controls_simple_for
            var controlsSimpleForId = "controls_simple_for";
            var controlsSimpleForDef = pxt.blocks.getBlockDefinition(controlsSimpleForId);
            Blockly.Blocks[controlsSimpleForId] = {
                /**
                 * Block for 'for' loop.
                 * @this Blockly.Block
                 */
                init: function () {
                    this.jsonInit({
                        "message0": controlsSimpleForDef.block["message0"],
                        "args0": [
                            {
                                "type": "field_variable",
                                "name": "VAR",
                                "variable": controlsSimpleForDef.block["variable"]
                                // Please note that most multilingual characters
                                // cannot be used as variable name at this point.
                                // Translate or decide the default variable name
                                // with care.
                            },
                            {
                                "type": "input_value",
                                "name": "TO",
                                "check": "Number"
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.getNamespaceColor('loops'),
                        "inputsInline": true
                    });
                    this.appendStatementInput('DO')
                        .appendField(controlsSimpleForDef.block["appendField"]);
                    var thisBlock = this;
                    setHelpResources(this, controlsSimpleForId, controlsSimpleForDef.name, function () {
                        return pxt.U.rlf(controlsSimpleForDef.tooltip, thisBlock.getField('VAR').getText());
                    }, controlsSimpleForDef.url, String(pxt.toolbox.getNamespaceColor('loops')));
                },
                /**
                 * Return all variables referenced by this block.
                 * @return {!Array.<string>} List of variable names.
                 * @this Blockly.Block
                 */
                getVars: function () {
                    return [this.getField('VAR').getText()];
                },
                /**
                 * Notification that a variable is renaming.
                 * If the name matches one of this block's variables, rename it.
                 * @param {string} oldName Previous name of variable.
                 * @param {string} newName Renamed variable.
                 * @this Blockly.Block
                 */
                renameVar: function (oldName, newName) {
                    var varField = this.getField('VAR');
                    if (Blockly.Names.equals(oldName, varField.getText())) {
                        varField.setValue(newName);
                    }
                },
                /**
                 * Add menu option to create getter block for loop variable.
                 * @param {!Array} options List of menu options to add to.
                 * @this Blockly.Block
                 */
                customContextMenu: function (options) {
                    if (!this.isCollapsed()) {
                        var option = { enabled: true };
                        var name_4 = this.getField('VAR').getText();
                        option.text = lf("Create 'get {0}'", name_4);
                        var xmlField = goog.dom.createDom('field', null, name_4);
                        xmlField.setAttribute('name', 'VAR');
                        var xmlBlock = goog.dom.createDom('block', null, xmlField);
                        xmlBlock.setAttribute('type', 'variables_get');
                        option.callback = Blockly.ContextMenu.callbackFactory(this, xmlBlock);
                        options.push(option);
                    }
                }
            };
            // break statement
            var breakBlockDef = pxt.blocks.getBlockDefinition(ts.pxtc.TS_BREAK_TYPE);
            Blockly.Blocks[pxtc.TS_BREAK_TYPE] = {
                init: function () {
                    var color = pxt.toolbox.getNamespaceColor('loops');
                    this.jsonInit({
                        "message0": breakBlockDef.block["message0"],
                        "inputsInline": true,
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": color
                    });
                    setHelpResources(this, ts.pxtc.TS_BREAK_TYPE, breakBlockDef.name, breakBlockDef.tooltip, breakBlockDef.url, color, undefined /*colourSecondary*/, undefined /*colourTertiary*/, false /*undeletable*/);
                }
            };
            // continue statement
            var continueBlockDef = pxt.blocks.getBlockDefinition(ts.pxtc.TS_CONTINUE_TYPE);
            Blockly.Blocks[pxtc.TS_CONTINUE_TYPE] = {
                init: function () {
                    var color = pxt.toolbox.getNamespaceColor('loops');
                    this.jsonInit({
                        "message0": continueBlockDef.block["message0"],
                        "inputsInline": true,
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": color
                    });
                    setHelpResources(this, ts.pxtc.TS_CONTINUE_TYPE, continueBlockDef.name, continueBlockDef.tooltip, continueBlockDef.url, color, undefined /*colourSecondary*/, undefined /*colourTertiary*/, false /*undeletable*/);
                }
            };
            var collapsedColor = "#cccccc";
            Blockly.Blocks[pxtc.COLLAPSED_BLOCK] = {
                init: function () {
                    this.jsonInit({
                        "message0": "...",
                        "inputsInline": true,
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": collapsedColor
                    });
                    setHelpResources(this, ts.pxtc.COLLAPSED_BLOCK, "...", lf("a few blocks"), undefined, collapsedColor, undefined /*colourSecondary*/, undefined /*colourTertiary*/, false /*undeletable*/);
                }
            };
        }
        blocks.onShowContextMenu = undefined;
        /**
         * The following patch to blockly is to add the Trash icon on top of the toolbox,
         * the trash icon should only show when a user drags a block that is already in the workspace.
         */
        function initDrag() {
            var calculateDistance = function (elemBounds, mouseX) {
                return Math.abs(mouseX - (elemBounds.left + (elemBounds.width / 2)));
            };
            /**
             * Execute a step of block dragging, based on the given event.  Update the
             * display accordingly.
             * @param {!Event} e The most recent move event.
             * @param {!goog.math.Coordinate} currentDragDeltaXY How far the pointer has
             *     moved from the position at the start of the drag, in pixel units.
             * @package
             */
            var blockDrag = Blockly.BlockDragger.prototype.dragBlock;
            Blockly.BlockDragger.prototype.dragBlock = function (e, currentDragDeltaXY) {
                var blocklyToolboxDiv = document.getElementsByClassName('blocklyToolboxDiv')[0];
                var blocklyTreeRoot = document.getElementsByClassName('blocklyTreeRoot')[0]
                    || document.getElementsByClassName('blocklyFlyout')[0];
                var trashIcon = document.getElementById("blocklyTrashIcon");
                if (blocklyTreeRoot && trashIcon) {
                    var distance = calculateDistance(blocklyTreeRoot.getBoundingClientRect(), e.clientX);
                    if (distance < 200) {
                        var opacity = distance / 200;
                        trashIcon.style.opacity = "" + (1 - opacity);
                        trashIcon.style.display = 'block';
                        if (blocklyToolboxDiv) {
                            blocklyTreeRoot.style.opacity = "" + opacity;
                            if (distance < 50) {
                                pxt.BrowserUtils.addClass(blocklyToolboxDiv, 'blocklyToolboxDeleting');
                            }
                        }
                    }
                    else {
                        trashIcon.style.display = 'none';
                        blocklyTreeRoot.style.opacity = '1';
                        if (blocklyToolboxDiv)
                            pxt.BrowserUtils.removeClass(blocklyToolboxDiv, 'blocklyToolboxDeleting');
                    }
                }
                return blockDrag.call(this, e, currentDragDeltaXY);
            };
            /**
             * Finish dragging the workspace and put everything back where it belongs.
             * @param {!goog.math.Coordinate} currentDragDeltaXY How far the pointer has
             *     moved from the position at the start of the drag, in pixel coordinates.
             * @package
             */
            var blockEndDrag = Blockly.BlockDragger.prototype.endBlockDrag;
            Blockly.BlockDragger.prototype.endBlockDrag = function (e, currentDragDeltaXY) {
                blockEndDrag.call(this, e, currentDragDeltaXY);
                var blocklyToolboxDiv = document.getElementsByClassName('blocklyToolboxDiv')[0];
                var blocklyTreeRoot = document.getElementsByClassName('blocklyTreeRoot')[0]
                    || document.getElementsByClassName('blocklyFlyout')[0];
                var trashIcon = document.getElementById("blocklyTrashIcon");
                if (trashIcon && blocklyTreeRoot) {
                    trashIcon.style.display = 'none';
                    blocklyTreeRoot.style.opacity = '1';
                    if (blocklyToolboxDiv)
                        pxt.BrowserUtils.removeClass(blocklyToolboxDiv, 'blocklyToolboxDeleting');
                }
            };
        }
        function initContextMenu() {
            // Translate the context menu for blocks.
            var msg = Blockly.Msg;
            msg.DUPLICATE_BLOCK = lf("{id:block}Duplicate");
            msg.DUPLICATE_COMMENT = lf("Duplicate Comment");
            msg.REMOVE_COMMENT = lf("Remove Comment");
            msg.ADD_COMMENT = lf("Add Comment");
            msg.EXTERNAL_INPUTS = lf("External Inputs");
            msg.INLINE_INPUTS = lf("Inline Inputs");
            msg.EXPAND_BLOCK = lf("Expand Block");
            msg.COLLAPSE_BLOCK = lf("Collapse Block");
            msg.ENABLE_BLOCK = lf("Enable Block");
            msg.DISABLE_BLOCK = lf("Disable Block");
            msg.DELETE_BLOCK = lf("Delete Block");
            msg.DELETE_X_BLOCKS = lf("Delete Blocks");
            msg.DELETE_ALL_BLOCKS = lf("Delete All Blocks");
            msg.HELP = lf("Help");
            // inject hook to handle openings docs
            Blockly.BlockSvg.prototype.showHelp = function () {
                var url = goog.isFunction(this.helpUrl) ? this.helpUrl() : this.helpUrl;
                if (url)
                    (pxt.blocks.openHelpUrl || window.open)(url);
            };
            // Use Blockly hook to customize context menu
            Blockly.WorkspaceSvg.prototype.configureContextMenu = function (options, e) {
                var _this = this;
                if (this.options.readOnly || this.isFlyout) {
                    return;
                }
                // Clear default Blockly options
                options.length = 0;
                var topBlocks = this.getTopBlocks(true);
                var eventGroup = Blockly.utils.genUid();
                var topComments = this.getTopComments();
                var ws = this;
                // Option to add a workspace comment.
                if (this.options.comments && !pxt.BrowserUtils.isIE()) {
                    options.push(Blockly.ContextMenu.workspaceCommentOption(ws, e));
                }
                // Option to delete all blocks.
                // Count the number of blocks that are deletable.
                var deleteList = Blockly.WorkspaceSvg.buildDeleteList_(topBlocks);
                var deleteCount = 0;
                for (var i = 0; i < deleteList.length; i++) {
                    if (!deleteList[i].isShadow()) {
                        deleteCount++;
                    }
                }
                // Add a little animation to deleting.
                var DELAY = 10;
                function deleteNext() {
                    Blockly.Events.setGroup(eventGroup);
                    var block = deleteList.shift();
                    if (block) {
                        if (block.workspace) {
                            block.dispose(false, true);
                            setTimeout(deleteNext, DELAY);
                        }
                        else {
                            deleteNext();
                        }
                    }
                    Blockly.Events.setGroup(false);
                }
                var deleteOption = {
                    text: deleteCount == 1 ? msg.DELETE_BLOCK : msg.DELETE_ALL_BLOCKS,
                    enabled: deleteCount > 0,
                    callback: function () {
                        pxt.tickEvent("blocks.context.delete", undefined, { interactiveConsent: true });
                        if (deleteCount < 2) {
                            deleteNext();
                        }
                        else {
                            Blockly.confirm(lf("Delete all {0} blocks?", deleteCount), function (ok) {
                                if (ok) {
                                    deleteNext();
                                }
                            });
                        }
                    }
                };
                options.push(deleteOption);
                var formatCodeOption = {
                    text: lf("Format Code"),
                    enabled: true,
                    callback: function () {
                        pxt.tickEvent("blocks.context.format", undefined, { interactiveConsent: true });
                        pxt.blocks.layout.flow(_this, { useViewWidth: true });
                    }
                };
                options.push(formatCodeOption);
                if (pxt.appTarget.appTheme.blocksCollapsing) {
                    // Option to collapse all top-level (enabled) blocks
                    var collapseAllOption = {
                        text: lf("Collapse Blocks"),
                        enabled: topBlocks.length && topBlocks.find(function (b) { return b.isEnabled() && !b.isCollapsed(); }),
                        callback: function () {
                            pxt.tickEvent("blocks.context.collapse", undefined, { interactiveConsent: true });
                            pxt.blocks.layout.setCollapsedAll(_this, true);
                        }
                    };
                    options.push(collapseAllOption);
                    // Option to expand all collapsed blocks
                    var expandAllOption = {
                        text: lf("Expand Blocks"),
                        enabled: topBlocks.length && topBlocks.find(function (b) { return b.isEnabled() && b.isCollapsed(); }),
                        callback: function () {
                            pxt.tickEvent("blocks.context.expand", undefined, { interactiveConsent: true });
                            pxt.blocks.layout.setCollapsedAll(_this, false);
                        }
                    };
                    options.push(expandAllOption);
                }
                if (pxt.blocks.layout.screenshotEnabled()) {
                    var screenshotOption = {
                        text: lf("Snapshot"),
                        enabled: topBlocks.length > 0 || topComments.length > 0,
                        callback: function () {
                            var _a;
                            pxt.tickEvent("blocks.context.screenshot", undefined, { interactiveConsent: true });
                            pxt.blocks.layout.screenshotAsync(_this, null, (_a = pxt.appTarget.appTheme) === null || _a === void 0 ? void 0 : _a.embedBlocksInSnapshot)
                                .done(function (uri) {
                                if (pxt.BrowserUtils.isSafari())
                                    uri = uri.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
                                pxt.BrowserUtils.browserDownloadDataUri(uri, (pxt.appTarget.nickname || pxt.appTarget.id) + "-" + lf("screenshot") + ".png");
                            });
                        },
                    };
                    options.push(screenshotOption);
                }
                // custom options...
                if (blocks.onShowContextMenu)
                    blocks.onShowContextMenu(this, options);
            };
            // Get rid of bumping behavior
            Blockly.Constants.Logic.LOGIC_COMPARE_ONCHANGE_MIXIN.onchange = function () { };
        }
        function initOnStart() {
            // on_start
            var onStartDef = pxt.blocks.getBlockDefinition(ts.pxtc.ON_START_TYPE);
            Blockly.Blocks[ts.pxtc.ON_START_TYPE] = {
                init: function () {
                    this.jsonInit({
                        "message0": onStartDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_dummy"
                            },
                            {
                                "type": "input_statement",
                                "name": "HANDLER"
                            }
                        ],
                        "colour": (pxt.appTarget.runtime ? pxt.appTarget.runtime.onStartColor : '') || pxt.toolbox.getNamespaceColor('loops')
                    });
                    setHelpResources(this, ts.pxtc.ON_START_TYPE, onStartDef.name, onStartDef.tooltip, onStartDef.url, String((pxt.appTarget.runtime ? pxt.appTarget.runtime.onStartColor : '') || pxt.toolbox.getNamespaceColor('loops')), undefined, undefined, pxt.appTarget.runtime ? pxt.appTarget.runtime.onStartUnDeletable : false);
                }
            };
            Blockly.Blocks[pxtc.TS_STATEMENT_TYPE] = {
                init: function () {
                    var _this = this;
                    var that = this;
                    that.setColour("#717171");
                    that.setPreviousStatement(true);
                    that.setNextStatement(true);
                    that.setInputsInline(false);
                    var pythonMode;
                    var lines;
                    that.domToMutation = function (element) {
                        var n = parseInt(element.getAttribute("numlines"));
                        that.declaredVariables = element.getAttribute("declaredvars");
                        lines = [];
                        for (var i = 0; i < n; i++) {
                            var line = element.getAttribute("line" + i);
                            lines.push(line);
                        }
                        // Add the initial TS inputs
                        that.setPythonEnabled(false);
                    };
                    that.mutationToDom = function () {
                        var mutation = document.createElement("mutation");
                        if (lines) {
                            lines.forEach(function (line, index) { return mutation.setAttribute("line" + index, line); });
                            mutation.setAttribute("numlines", lines.length.toString());
                        }
                        if (that.declaredVariables) {
                            mutation.setAttribute("declaredvars", _this.declaredVariables);
                        }
                        return mutation;
                    };
                    // Consumed by the webapp
                    that.setPythonEnabled = function (enabled) {
                        if (pythonMode === enabled)
                            return;
                        // Remove all inputs
                        while (that.inputList.length) {
                            that.removeInput(that.inputList[0].name);
                        }
                        pythonMode = enabled;
                        if (enabled) {
                            // This field must be named LINE0 because otherwise Blockly will crash
                            // when trying to make an insertion marker. All insertion marker blocks
                            // need to have the same fields as the real block, and this field will
                            // always be created by domToMutation regardless of TS or Python mode
                            that.appendDummyInput().appendField(pxt.Util.lf("<python code>"), "LINE0");
                            that.setTooltip(lf("A Python statement that could not be converted to blocks"));
                        }
                        else {
                            lines.forEach(function (line, index) {
                                that.appendDummyInput().appendField(line, "LINE" + index);
                            });
                            that.setTooltip(lf("A JavaScript statement that could not be converted to blocks"));
                        }
                    };
                    // Consumed by BlocklyCompiler
                    that.getLines = function () { return lines; };
                    that.setEditable(false);
                    setHelpResources(this, pxtc.TS_STATEMENT_TYPE, lf("JavaScript statement"), lf("A JavaScript statement that could not be converted to blocks"), '/blocks/javascript-blocks', '#717171');
                }
            };
            Blockly.Blocks[pxtc.TS_OUTPUT_TYPE] = {
                init: function () {
                    var that = this;
                    that.setColour("#717171");
                    that.setPreviousStatement(false);
                    that.setNextStatement(false);
                    that.setOutput(true);
                    that.setEditable(false);
                    that.appendDummyInput().appendField(new pxtblockly.FieldTsExpression(""), "EXPRESSION");
                    that.setPythonEnabled = function (enabled) {
                        that.getField("EXPRESSION").setPythonEnabled(enabled);
                        if (enabled) {
                            that.setTooltip(lf("A Python expression that could not be converted to blocks"));
                        }
                        else {
                            that.setTooltip(lf("A JavaScript expression that could not be converted to blocks"));
                        }
                    };
                    setHelpResources(that, pxtc.TS_OUTPUT_TYPE, lf("JavaScript expression"), lf("A JavaScript expression that could not be converted to blocks"), '/blocks/javascript-blocks', "#717171");
                }
            };
            if (pxt.appTarget.runtime && pxt.appTarget.runtime.pauseUntilBlock) {
                var blockOptions_1 = pxt.appTarget.runtime.pauseUntilBlock;
                var blockDef_1 = pxt.blocks.getBlockDefinition(ts.pxtc.PAUSE_UNTIL_TYPE);
                Blockly.Blocks[pxtc.PAUSE_UNTIL_TYPE] = {
                    init: function () {
                        var color = blockOptions_1.color || pxt.toolbox.getNamespaceColor('loops');
                        this.jsonInit({
                            "message0": blockDef_1.block["message0"],
                            "args0": [
                                {
                                    "type": "input_value",
                                    "name": "PREDICATE",
                                    "check": "Boolean"
                                }
                            ],
                            "inputsInline": true,
                            "previousStatement": null,
                            "nextStatement": null,
                            "colour": color
                        });
                        setHelpResources(this, ts.pxtc.PAUSE_UNTIL_TYPE, blockDef_1.name, blockDef_1.tooltip, blockDef_1.url, color, undefined /*colourSecondary*/, undefined /*colourTertiary*/, false /*undeletable*/);
                    }
                };
            }
            // pxt_controls_for_of
            var pxtControlsForOfId = "pxt_controls_for_of";
            var pxtControlsForOfDef = pxt.blocks.getBlockDefinition(pxtControlsForOfId);
            Blockly.Blocks[pxtControlsForOfId] = {
                init: function () {
                    this.jsonInit({
                        "message0": pxtControlsForOfDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "VAR",
                                "variable": pxtControlsForOfDef.block["variable"],
                                "check": "Variable"
                            },
                            {
                                "type": "input_value",
                                "name": "LIST",
                                "check": ["Array", "String"]
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.blockColors['loops'],
                        "inputsInline": true
                    });
                    this.appendStatementInput('DO')
                        .appendField(pxtControlsForOfDef.block["appendField"]);
                    var thisBlock = this;
                    setHelpResources(this, pxtControlsForOfId, pxtControlsForOfDef.name, function () {
                        return pxt.U.rlf(pxtControlsForOfDef.tooltip, thisBlock.getInputTargetBlock('VAR') ? thisBlock.getInputTargetBlock('VAR').getField('VAR').getText() : '');
                    }, pxtControlsForOfDef.url, String(pxt.toolbox.getNamespaceColor('loops')));
                }
            };
            // controls_for_of
            var controlsForOfId = "controls_for_of";
            var controlsForOfDef = pxt.blocks.getBlockDefinition(controlsForOfId);
            Blockly.Blocks[controlsForOfId] = {
                init: function () {
                    this.jsonInit({
                        "message0": controlsForOfDef.block["message0"],
                        "args0": [
                            {
                                "type": "field_variable",
                                "name": "VAR",
                                "variable": controlsForOfDef.block["variable"]
                                // Please note that most multilingual characters
                                // cannot be used as variable name at this point.
                                // Translate or decide the default variable name
                                // with care.
                            },
                            {
                                "type": "input_value",
                                "name": "LIST",
                                "check": "Array"
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.blockColors['loops'],
                        "inputsInline": true
                    });
                    this.appendStatementInput('DO')
                        .appendField(controlsForOfDef.block["appendField"]);
                    var thisBlock = this;
                    setHelpResources(this, controlsForOfId, controlsForOfDef.name, function () {
                        return pxt.U.rlf(controlsForOfDef.tooltip, thisBlock.getField('VAR').getText());
                    }, controlsForOfDef.url, String(pxt.toolbox.getNamespaceColor('loops')));
                }
            };
            // lists_index_get
            var listsIndexGetId = "lists_index_get";
            var listsIndexGetDef = pxt.blocks.getBlockDefinition(listsIndexGetId);
            Blockly.Blocks["lists_index_get"] = {
                init: function () {
                    this.jsonInit({
                        "message0": listsIndexGetDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "LIST",
                                "check": "Array"
                            },
                            {
                                "type": "input_value",
                                "name": "INDEX",
                                "check": "Number"
                            }
                        ],
                        "colour": pxt.toolbox.blockColors['arrays'],
                        "outputShape": Blockly.OUTPUT_SHAPE_ROUND,
                        "inputsInline": true
                    });
                    this.setPreviousStatement(false);
                    this.setNextStatement(false);
                    this.setOutput(true);
                    setBuiltinHelpInfo(this, listsIndexGetId);
                }
            };
            // lists_index_set
            var listsIndexSetId = "lists_index_set";
            var listsIndexSetDef = pxt.blocks.getBlockDefinition(listsIndexSetId);
            Blockly.Blocks[listsIndexSetId] = {
                init: function () {
                    this.jsonInit({
                        "message0": listsIndexSetDef.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "LIST",
                                "check": "Array"
                            },
                            {
                                "type": "input_value",
                                "name": "INDEX",
                                "check": "Number"
                            },
                            {
                                "type": "input_value",
                                "name": "VALUE",
                                "check": null
                            }
                        ],
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.blockColors['arrays'],
                        "inputsInline": true
                    });
                    setBuiltinHelpInfo(this, listsIndexSetId);
                }
            };
        }
        function initMath() {
            // math_op2
            var mathOp2Id = "math_op2";
            var mathOp2Def = pxt.blocks.getBlockDefinition(mathOp2Id);
            var mathOp2Tooltips = mathOp2Def.tooltip;
            Blockly.Blocks[mathOp2Id] = {
                init: function () {
                    this.jsonInit({
                        "message0": lf("%1 of %2 and %3"),
                        "args0": [
                            {
                                "type": "field_dropdown",
                                "name": "op",
                                "options": [
                                    [lf("{id:op}min"), "min"],
                                    [lf("{id:op}max"), "max"]
                                ]
                            },
                            {
                                "type": "input_value",
                                "name": "x",
                                "check": "Number"
                            },
                            {
                                "type": "input_value",
                                "name": "y",
                                "check": "Number"
                            }
                        ],
                        "inputsInline": true,
                        "output": "Number",
                        "outputShape": Blockly.OUTPUT_SHAPE_ROUND,
                        "colour": pxt.toolbox.getNamespaceColor('math')
                    });
                    var thisBlock = this;
                    setHelpResources(this, mathOp2Id, mathOp2Def.name, function (block) {
                        return mathOp2Tooltips[block.getFieldValue('op')];
                    }, mathOp2Def.url, pxt.toolbox.getNamespaceColor(mathOp2Def.category));
                }
            };
            // math_op3
            var mathOp3Id = "math_op3";
            var mathOp3Def = pxt.blocks.getBlockDefinition(mathOp3Id);
            Blockly.Blocks[mathOp3Id] = {
                init: function () {
                    this.jsonInit({
                        "message0": mathOp3Def.block["message0"],
                        "args0": [
                            {
                                "type": "input_value",
                                "name": "x",
                                "check": "Number"
                            }
                        ],
                        "inputsInline": true,
                        "output": "Number",
                        "outputShape": Blockly.OUTPUT_SHAPE_ROUND,
                        "colour": pxt.toolbox.getNamespaceColor('math')
                    });
                    setBuiltinHelpInfo(this, mathOp3Id);
                }
            };
            // builtin math_number, math_integer, math_whole_number, math_number_minmax
            //XXX Integer validation needed.
            var numberBlocks = ['math_number', 'math_integer', 'math_whole_number', 'math_number_minmax'];
            numberBlocks.forEach(function (num_id) {
                var mInfo = pxt.blocks.getBlockDefinition(num_id);
                installHelpResources(num_id, mInfo.name, mInfo.tooltip, mInfo.url, Blockly.Colours.textField, Blockly.Colours.textField, Blockly.Colours.textField);
            });
            // builtin math_arithmetic
            var msg = Blockly.Msg;
            var mathArithmeticId = "math_arithmetic";
            var mathArithmeticDef = pxt.blocks.getBlockDefinition(mathArithmeticId);
            var mathArithmeticTooltips = mathArithmeticDef.tooltip;
            msg.MATH_ADDITION_SYMBOL = mathArithmeticDef.block["MATH_ADDITION_SYMBOL"];
            msg.MATH_SUBTRACTION_SYMBOL = mathArithmeticDef.block["MATH_SUBTRACTION_SYMBOL"];
            msg.MATH_MULTIPLICATION_SYMBOL = mathArithmeticDef.block["MATH_MULTIPLICATION_SYMBOL"];
            msg.MATH_DIVISION_SYMBOL = mathArithmeticDef.block["MATH_DIVISION_SYMBOL"];
            msg.MATH_POWER_SYMBOL = mathArithmeticDef.block["MATH_POWER_SYMBOL"];
            installHelpResources(mathArithmeticId, mathArithmeticDef.name, function (block) {
                return mathArithmeticTooltips[block.getFieldValue('OP')];
            }, mathArithmeticDef.url, pxt.toolbox.getNamespaceColor(mathArithmeticDef.category));
            // builtin math_modulo
            var mathModuloId = "math_modulo";
            var mathModuloDef = pxt.blocks.getBlockDefinition(mathModuloId);
            msg.MATH_MODULO_TITLE = mathModuloDef.block["MATH_MODULO_TITLE"];
            installBuiltinHelpInfo(mathModuloId);
            blocks.initMathOpBlock();
            blocks.initMathRoundBlock();
        }
        function initVariables() {
            // We only give types to "special" variables like enum members and we don't
            // want those showing up in the variable dropdown so filter the variables
            // that show up to only ones that have an empty type
            Blockly.FieldVariable.prototype.getVariableTypes_ = function () { return [""]; };
            var varname = lf("{id:var}item");
            Blockly.Variables.flyoutCategory = function (workspace) {
                var xmlList = [];
                if (!pxt.appTarget.appTheme.hideFlyoutHeadings) {
                    // Add the Heading label
                    var headingLabel = createFlyoutHeadingLabel(lf("Variables"), pxt.toolbox.getNamespaceColor('variables'), pxt.toolbox.getNamespaceIcon('variables'));
                    xmlList.push(headingLabel);
                }
                var button = document.createElement('button');
                button.setAttribute('text', lf("Make a Variable..."));
                button.setAttribute('callbackKey', 'CREATE_VARIABLE');
                workspace.registerButtonCallback('CREATE_VARIABLE', function (button) {
                    Blockly.Variables.createVariable(button.getTargetWorkspace());
                });
                xmlList.push(button);
                var blockList = Blockly.Variables.flyoutCategoryBlocks(workspace);
                xmlList = xmlList.concat(blockList);
                return xmlList;
            };
            Blockly.Variables.flyoutCategoryBlocks = function (workspace) {
                var variableModelList = workspace.getVariablesOfType('');
                var xmlList = [];
                if (variableModelList.length > 0) {
                    var mostRecentVariable = variableModelList[variableModelList.length - 1];
                    variableModelList.sort(Blockly.VariableModel.compareByName);
                    // variables getters first
                    for (var i = 0; i < variableModelList.length; i++) {
                        var variable = variableModelList[i];
                        if (Blockly.Blocks['variables_get']) {
                            var blockText = '<xml>' +
                                '<block type="variables_get" gap="8">' +
                                Blockly.Variables.generateVariableFieldXmlString(variable) +
                                '</block>' +
                                '</xml>';
                            var block = Blockly.Xml.textToDom(blockText).firstChild;
                            xmlList.push(block);
                        }
                    }
                    xmlList[xmlList.length - 1].setAttribute('gap', '24');
                    if (Blockly.Blocks['variables_set']) {
                        var gap = Blockly.Blocks['variables_change'] ? 8 : 24;
                        var blockText = '<xml>' +
                            '<block type="variables_set" gap="' + gap + '">' +
                            Blockly.Variables.generateVariableFieldXmlString(mostRecentVariable) +
                            '</block>' +
                            '</xml>';
                        var block = Blockly.Xml.textToDom(blockText).firstChild;
                        {
                            var value = goog.dom.createDom('value');
                            value.setAttribute('name', 'VALUE');
                            var shadow = goog.dom.createDom('shadow');
                            shadow.setAttribute("type", "math_number");
                            value.appendChild(shadow);
                            var field = goog.dom.createDom('field');
                            field.setAttribute('name', 'NUM');
                            field.appendChild(document.createTextNode("0"));
                            shadow.appendChild(field);
                            block.appendChild(value);
                        }
                        xmlList.push(block);
                    }
                    if (Blockly.Blocks['variables_change']) {
                        var gap = Blockly.Blocks['variables_get'] ? 20 : 8;
                        var blockText = '<xml>' +
                            '<block type="variables_change" gap="' + gap + '">' +
                            Blockly.Variables.generateVariableFieldXmlString(mostRecentVariable) +
                            '<value name="DELTA">' +
                            '<shadow type="math_number">' +
                            '<field name="NUM">1</field>' +
                            '</shadow>' +
                            '</value>' +
                            '</block>' +
                            '</xml>';
                        var block = Blockly.Xml.textToDom(blockText).firstChild;
                        {
                            var value = goog.dom.createDom('value');
                            value.setAttribute('name', 'VALUE');
                            var shadow = goog.dom.createDom('shadow');
                            shadow.setAttribute("type", "math_number");
                            value.appendChild(shadow);
                            var field = goog.dom.createDom('field');
                            field.setAttribute('name', 'NUM');
                            field.appendChild(document.createTextNode("1"));
                            shadow.appendChild(field);
                            block.appendChild(value);
                        }
                        xmlList.push(block);
                    }
                }
                return xmlList;
            };
            // builtin variables_get
            var msg = Blockly.Msg;
            var variablesGetId = "variables_get";
            var variablesGetDef = pxt.blocks.getBlockDefinition(variablesGetId);
            msg.VARIABLES_GET_CREATE_SET = variablesGetDef.block["VARIABLES_GET_CREATE_SET"];
            installBuiltinHelpInfo(variablesGetId);
            var variablesReporterGetId = "variables_get_reporter";
            installBuiltinHelpInfo(variablesReporterGetId);
            // Dropdown menu of variables_get
            msg.RENAME_VARIABLE = lf("Rename variable...");
            msg.DELETE_VARIABLE = lf("Delete the \"%1\" variable");
            msg.DELETE_VARIABLE_CONFIRMATION = lf("Delete %1 uses of the \"%2\" variable?");
            msg.NEW_VARIABLE_DROPDOWN = lf("New variable...");
            // builtin variables_set
            var variablesSetId = "variables_set";
            var variablesSetDef = pxt.blocks.getBlockDefinition(variablesSetId);
            msg.VARIABLES_SET = variablesSetDef.block["VARIABLES_SET"];
            msg.VARIABLES_DEFAULT_NAME = varname;
            msg.VARIABLES_SET_CREATE_GET = lf("Create 'get %1'");
            installBuiltinHelpInfo(variablesSetId);
            // pxt variables_change
            var variablesChangeId = "variables_change";
            var variablesChangeDef = pxt.blocks.getBlockDefinition(variablesChangeId);
            Blockly.Blocks[variablesChangeId] = {
                init: function () {
                    this.jsonInit({
                        "message0": variablesChangeDef.block["message0"],
                        "args0": [
                            {
                                "type": "field_variable",
                                "name": "VAR",
                                "variable": varname
                            },
                            {
                                "type": "input_value",
                                "name": "VALUE",
                                "check": "Number"
                            }
                        ],
                        "inputsInline": true,
                        "previousStatement": null,
                        "nextStatement": null,
                        "colour": pxt.toolbox.getNamespaceColor('variables')
                    });
                    setBuiltinHelpInfo(this, variablesChangeId);
                },
                /**
                 * Add menu option to create getter block for this variable
                 * @param {!Array} options List of menu options to add to.
                 * @this Blockly.Block
                 */
                customContextMenu: function (options) {
                    var option = {
                        enabled: this.workspace.remainingCapacity() > 0
                    };
                    var name = this.getField("VAR").getText();
                    option.text = lf("Create 'get {0}'", name);
                    var xmlField = goog.dom.createDom('field', null, name);
                    xmlField.setAttribute('name', 'VAR');
                    var xmlBlock = goog.dom.createDom('block', null, xmlField);
                    xmlBlock.setAttribute('type', "variables_get");
                    option.callback = Blockly.ContextMenu.callbackFactory(this, xmlBlock);
                    options.push(option);
                }
            };
            // New variable dialog
            msg.NEW_VARIABLE_TITLE = lf("New variable name:");
            // Rename variable dialog
            msg.RENAME_VARIABLE_TITLE = lf("Rename all '%1' variables to:");
        }
        function initFunctions() {
            var msg = Blockly.Msg;
            // New functions implementation messages
            msg.FUNCTION_CREATE_NEW = lf("Make a Function...");
            msg.FUNCTION_WARNING_DUPLICATE_ARG = lf("Functions cannot use the same argument name more than once.");
            msg.FUNCTION_WARNING_ARG_NAME_IS_FUNCTION_NAME = lf("Argument names must not be the same as the function name.");
            msg.FUNCTION_WARNING_EMPTY_NAME = lf("Function and argument names cannot be empty.");
            msg.FUNCTIONS_DEFAULT_FUNCTION_NAME = lf("doSomething");
            msg.FUNCTIONS_DEFAULT_BOOLEAN_ARG_NAME = lf("bool");
            msg.FUNCTIONS_DEFAULT_STRING_ARG_NAME = lf("text");
            msg.FUNCTIONS_DEFAULT_NUMBER_ARG_NAME = lf("num");
            msg.FUNCTIONS_DEFAULT_CUSTOM_ARG_NAME = lf("arg");
            msg.PROCEDURES_HUE = pxt.toolbox.getNamespaceColor("functions");
            msg.REPORTERS_HUE = pxt.toolbox.getNamespaceColor("variables");
            // builtin procedures_defnoreturn
            var proceduresDefId = "procedures_defnoreturn";
            var proceduresDef = pxt.blocks.getBlockDefinition(proceduresDefId);
            msg.PROCEDURES_DEFNORETURN_TITLE = proceduresDef.block["PROCEDURES_DEFNORETURN_TITLE"];
            msg.PROCEDURE_ALREADY_EXISTS = proceduresDef.block["PROCEDURE_ALREADY_EXISTS"];
            (Blockly.Blocks['procedures_defnoreturn']).init = function () {
                var nameField = new Blockly.FieldTextInput('', Blockly.Procedures.rename);
                //nameField.setSpellcheck(false); //TODO
                this.appendDummyInput()
                    .appendField(Blockly.Msg.PROCEDURES_DEFNORETURN_TITLE)
                    .appendField(nameField, 'NAME')
                    .appendField('', 'PARAMS');
                this.setColour(pxt.toolbox.getNamespaceColor('functions'));
                this.arguments_ = [];
                this.argumentVarModels_ = [];
                this.setStartHat(true);
                this.setStatements_(true);
                this.statementConnection_ = null;
            };
            installBuiltinHelpInfo(proceduresDefId);
            // builtin procedures_defnoreturn
            var proceduresCallId = "procedures_callnoreturn";
            var proceduresCallDef = pxt.blocks.getBlockDefinition(proceduresCallId);
            msg.PROCEDURES_CALLRETURN_TOOLTIP = proceduresDef.tooltip.toString();
            Blockly.Blocks['procedures_callnoreturn'] = {
                init: function () {
                    var nameField = new pxtblockly.FieldProcedure('');
                    this.appendDummyInput('TOPROW')
                        .appendField(proceduresCallDef.block['PROCEDURES_CALLNORETURN_TITLE'])
                        .appendField(nameField, 'NAME');
                    this.setPreviousStatement(true);
                    this.setNextStatement(true);
                    this.setColour(pxt.toolbox.getNamespaceColor('functions'));
                    this.arguments_ = [];
                    this.quarkConnections_ = {};
                    this.quarkIds_ = null;
                },
                /**
                 * Returns the name of the procedure this block calls.
                 * @return {string} Procedure name.
                 * @this Blockly.Block
                 */
                getProcedureCall: function () {
                    // The NAME field is guaranteed to exist, null will never be returned.
                    return /** @type {string} */ (this.getFieldValue('NAME'));
                },
                /**
                 * Notification that a procedure is renaming.
                 * If the name matches this block's procedure, rename it.
                 * @param {string} oldName Previous name of procedure.
                 * @param {string} newName Renamed procedure.
                 * @this Blockly.Block
                 */
                renameProcedure: function (oldName, newName) {
                    if (Blockly.Names.equals(oldName, this.getProcedureCall())) {
                        this.setFieldValue(newName, 'NAME');
                    }
                },
                /**
                 * Procedure calls cannot exist without the corresponding procedure
                 * definition.  Enforce this link whenever an event is fired.
                 * @param {!Blockly.Events.Abstract} event Change event.
                 * @this Blockly.Block
                 */
                onchange: function (event) {
                    if (!this.workspace || this.workspace.isFlyout || this.isInsertionMarker()) {
                        // Block is deleted or is in a flyout or insertion marker.
                        return;
                    }
                    if (event.type == Blockly.Events.CREATE &&
                        event.ids.indexOf(this.id) != -1) {
                        // Look for the case where a procedure call was created (usually through
                        // paste) and there is no matching definition.  In this case, create
                        // an empty definition block with the correct signature.
                        var name_5 = this.getProcedureCall();
                        var def = Blockly.Procedures.getDefinition(name_5, this.workspace);
                        if (def && (def.type != this.defType_ ||
                            JSON.stringify(def.arguments_) != JSON.stringify(this.arguments_))) {
                            // The signatures don't match.
                            def = null;
                        }
                        if (!def) {
                            Blockly.Events.setGroup(event.group);
                            /**
                             * Create matching definition block.
                             * <xml>
                             *   <block type="procedures_defreturn" x="10" y="20">
                             *     <field name="NAME">test</field>
                             *   </block>
                             * </xml>
                             */
                            var xml = Blockly.utils.xml.createElement('xml');
                            var block = Blockly.utils.xml.createElement('block');
                            block.setAttribute('type', this.defType_);
                            var xy = this.getRelativeToSurfaceXY();
                            var x = xy.x + Blockly.SNAP_RADIUS * (this.RTL ? -1 : 1);
                            var y = xy.y + Blockly.SNAP_RADIUS * 2;
                            block.setAttribute('x', x);
                            block.setAttribute('y', y);
                            var field = Blockly.utils.xml.createElement('field');
                            field.setAttribute('name', 'NAME');
                            field.appendChild(document.createTextNode(this.getProcedureCall()));
                            block.appendChild(field);
                            xml.appendChild(block);
                            pxt.blocks.domToWorkspaceNoEvents(xml, this.workspace);
                            Blockly.Events.setGroup(false);
                        }
                    }
                    else if (event.type == Blockly.Events.DELETE) {
                        // Look for the case where a procedure definition has been deleted,
                        // leaving this block (a procedure call) orphaned.  In this case, delete
                        // the orphan.
                        var name_6 = this.getProcedureCall();
                        var def = Blockly.Procedures.getDefinition(name_6, this.workspace);
                        if (!def) {
                            Blockly.Events.setGroup(event.group);
                            this.dispose(true, false);
                            Blockly.Events.setGroup(false);
                        }
                    }
                },
                mutationToDom: function () {
                    var mutationElement = document.createElement("mutation");
                    mutationElement.setAttribute("name", this.getProcedureCall());
                    return mutationElement;
                },
                domToMutation: function (element) {
                    var name = element.getAttribute("name");
                    this.renameProcedure(this.getProcedureCall(), name);
                },
                /**
                 * Add menu option to find the definition block for this call.
                 * @param {!Array} options List of menu options to add to.
                 * @this Blockly.Block
                 */
                customContextMenu: function (options) {
                    var option = { enabled: true };
                    option.text = Blockly.Msg.PROCEDURES_HIGHLIGHT_DEF;
                    var name = this.getProcedureCall();
                    var workspace = this.workspace;
                    option.callback = function () {
                        var def = Blockly.Procedures.getDefinition(name, workspace);
                        if (def)
                            def.select();
                    };
                    options.push(option);
                },
                defType_: 'procedures_defnoreturn'
            };
            installBuiltinHelpInfo(proceduresCallId);
            // New functions implementation function_definition
            var functionDefinitionId = "function_definition";
            var functionDefinition = pxt.blocks.getBlockDefinition(functionDefinitionId);
            msg.FUNCTIONS_EDIT_OPTION = functionDefinition.block["FUNCTIONS_EDIT_OPTION"];
            installBuiltinHelpInfo(functionDefinitionId);
            // New functions implementation function_call
            var functionCallId = "function_call";
            var functionCall = pxt.blocks.getBlockDefinition(functionCallId);
            msg.FUNCTIONS_CALL_TITLE = functionCall.block["FUNCTIONS_CALL_TITLE"];
            installBuiltinHelpInfo(functionCallId);
            installBuiltinHelpInfo("function_call_output");
            var functionReturnId = "function_return";
            Blockly.Blocks[functionReturnId] = {
                init: function () {
                    blocks.initReturnStatement(this);
                },
                onchange: function (event) {
                    var block = this;
                    if (!block.workspace || block.workspace.isFlyout) {
                        // Block is deleted or is in a flyout.
                        return;
                    }
                    var thisWasCreated = event.type === Blockly.Events.BLOCK_CREATE && event.ids.indexOf(block.id) != -1;
                    var thisWasDragged = event.type === Blockly.Events.END_DRAG && event.allNestedIds.indexOf(block.id) != -1;
                    if (thisWasCreated || thisWasDragged) {
                        var rootBlock = block.getRootBlock();
                        var isTopBlock = rootBlock.type === functionReturnId;
                        if (isTopBlock || rootBlock.previousConnection != null) {
                            // Statement is by itself on the workspace, or it is slotted into a
                            // stack of statements that is not attached to a function or event. Let
                            // it exist until it is connected to a function
                            return;
                        }
                        if (rootBlock.type !== functionDefinitionId) {
                            // Not a function block, so disconnect
                            Blockly.Events.setGroup(event.group);
                            block.previousConnection.disconnect();
                            Blockly.Events.setGroup(false);
                        }
                    }
                }
            };
            installBuiltinHelpInfo(functionReturnId);
            Blockly.Procedures.flyoutCategory = function (workspace) {
                var xmlList = [];
                if (!pxt.appTarget.appTheme.hideFlyoutHeadings) {
                    // Add the Heading label
                    var headingLabel = createFlyoutHeadingLabel(lf("Functions"), pxt.toolbox.getNamespaceColor('functions'), pxt.toolbox.getNamespaceIcon('functions'), 'blocklyFlyoutIconfunctions');
                    xmlList.push(headingLabel);
                }
                var newFunction = lf("Make a Function...");
                var newFunctionTitle = lf("New function name:");
                // Add the "Make a function" button
                var button = Blockly.utils.xml.createElement('button');
                button.setAttribute('text', newFunction);
                button.setAttribute('callbackKey', 'CREATE_FUNCTION');
                var createFunction = function (name) {
                    /**
                     * Create matching definition block.
                     * <xml>
                     *   <block type="procedures_defreturn" x="10" y="20">
                     *     <field name="NAME">test</field>
                     *   </block>
                     * </xml>
                     */
                    var topBlock = workspace.getTopBlocks(true)[0];
                    var x = 10, y = 10;
                    if (topBlock) {
                        var xy = topBlock.getRelativeToSurfaceXY();
                        x = xy.x + Blockly.SNAP_RADIUS * (topBlock.RTL ? -1 : 1);
                        y = xy.y + Blockly.SNAP_RADIUS * 2;
                    }
                    var xml = Blockly.utils.xml.createElement('xml');
                    var block = Blockly.utils.xml.createElement('block');
                    block.setAttribute('type', 'procedures_defnoreturn');
                    block.setAttribute('x', String(x));
                    block.setAttribute('y', String(y));
                    var field = Blockly.utils.xml.createElement('field');
                    field.setAttribute('name', 'NAME');
                    field.appendChild(document.createTextNode(name));
                    block.appendChild(field);
                    xml.appendChild(block);
                    var newBlockIds = pxt.blocks.domToWorkspaceNoEvents(xml, workspace);
                    // Close flyout and highlight block
                    Blockly.hideChaff();
                    var newBlock = workspace.getBlockById(newBlockIds[0]);
                    newBlock.select();
                    // Center on the new block so we know where it is
                    workspace.centerOnBlock(newBlock.id);
                };
                workspace.registerButtonCallback('CREATE_FUNCTION', function (button) {
                    var promptAndCheckWithAlert = function (defaultName) {
                        Blockly.prompt(newFunctionTitle, defaultName, function (newFunc) {
                            pxt.tickEvent('blocks.makeafunction');
                            // Merge runs of whitespace.  Strip leading and trailing whitespace.
                            // Beyond this, all names are legal.
                            if (newFunc) {
                                newFunc = newFunc.replace(/[\s\xa0]+/g, ' ').replace(/^ | $/g, '');
                                if (newFunc == newFunction) {
                                    // Ok, not ALL names are legal...
                                    newFunc = null;
                                }
                            }
                            if (newFunc) {
                                if (workspace.getVariable(newFunc)) {
                                    Blockly.alert(Blockly.Msg.VARIABLE_ALREADY_EXISTS.replace('%1', newFunc.toLowerCase()), function () {
                                        promptAndCheckWithAlert(newFunc); // Recurse
                                    });
                                }
                                else if (!Blockly.Procedures.isLegalName_(newFunc, workspace)) {
                                    Blockly.alert(Blockly.Msg.PROCEDURE_ALREADY_EXISTS.replace('%1', newFunc.toLowerCase()), function () {
                                        promptAndCheckWithAlert(newFunc); // Recurse
                                    });
                                }
                                else {
                                    createFunction(newFunc);
                                }
                            }
                        });
                    };
                    promptAndCheckWithAlert('doSomething');
                });
                xmlList.push(button);
                function populateProcedures(procedureList, templateName) {
                    for (var i = 0; i < procedureList.length; i++) {
                        var name_7 = procedureList[i][0];
                        var args = procedureList[i][1];
                        // <block type="procedures_callnoreturn" gap="16">
                        //   <field name="NAME">name</field>
                        // </block>
                        var block = Blockly.utils.xml.createElement('block');
                        block.setAttribute('type', templateName);
                        block.setAttribute('gap', '16');
                        block.setAttribute('colour', pxt.toolbox.getNamespaceColor('functions'));
                        var field = goog.dom.createDom('field', null, name_7);
                        field.setAttribute('name', 'NAME');
                        block.appendChild(field);
                        xmlList.push(block);
                    }
                }
                var tuple = Blockly.Procedures.allProcedures(workspace);
                populateProcedures(tuple[0], 'procedures_callnoreturn');
                return xmlList;
            };
            // Patch new functions flyout to add the heading
            var oldFlyout = Blockly.Functions.flyoutCategory;
            Blockly.Functions.flyoutCategory = function (workspace) {
                var elems = oldFlyout(workspace);
                if (elems.length > 1) {
                    var returnBlock = mkReturnStatementBlock();
                    // Insert after the "make a function" button
                    elems.splice(1, 0, returnBlock);
                }
                var functionsWithReturn = Blockly.Functions.getAllFunctionDefinitionBlocks(workspace)
                    .filter(function (def) { return def.getDescendants(false).some(function (child) { return child.type === "function_return" && child.getInputTargetBlock("RETURN_VALUE"); }); })
                    .map(function (def) { return def.getField("function_name").getText(); });
                var headingLabel = createFlyoutHeadingLabel(lf("Functions"), pxt.toolbox.getNamespaceColor('functions'), pxt.toolbox.getNamespaceIcon('functions'), 'blocklyFlyoutIconfunctions');
                elems.unshift(headingLabel);
                var res = [];
                var _loop_1 = function (e) {
                    res.push(e);
                    if (e.getAttribute("type") === "function_call") {
                        var mutation = e.children.item(0);
                        if (mutation) {
                            var name_8 = mutation.getAttribute("name");
                            if (functionsWithReturn.some(function (n) { return n === name_8; })) {
                                var clone = e.cloneNode(true);
                                clone.setAttribute("type", "function_call_output");
                                res.push(clone);
                            }
                        }
                    }
                };
                for (var _i = 0, elems_1 = elems; _i < elems_1.length; _i++) {
                    var e = elems_1[_i];
                    _loop_1(e);
                }
                return res;
            };
            // Configure function editor argument icons
            var iconsMap = {
                number: pxt.blocks.defaultIconForArgType("number"),
                boolean: pxt.blocks.defaultIconForArgType("boolean"),
                string: pxt.blocks.defaultIconForArgType("string")
            };
            var customNames = {};
            var functionOptions = pxt.appTarget.runtime && pxt.appTarget.runtime.functionsOptions;
            if (functionOptions && functionOptions.extraFunctionEditorTypes) {
                functionOptions.extraFunctionEditorTypes.forEach(function (t) {
                    iconsMap[t.typeName] = t.icon || pxt.blocks.defaultIconForArgType();
                    if (t.defaultName) {
                        customNames[t.typeName] = t.defaultName;
                    }
                });
            }
            Blockly.PXTBlockly.FunctionUtils.argumentIcons = iconsMap;
            Blockly.PXTBlockly.FunctionUtils.argumentDefaultNames = customNames;
            if (Blockly.Blocks["argument_reporter_custom"]) {
                // The logic for setting the output check relies on the internals of PXT
                // too much to be refactored into pxt-blockly, so we need to monkey patch
                // it here
                (Blockly.Blocks["argument_reporter_custom"]).domToMutation = function (xmlElement) {
                    var typeName = xmlElement.getAttribute('typename');
                    this.typeName_ = typeName;
                    setOutputCheck(this, typeName, cachedBlockInfo);
                };
            }
        }
        function initLogic() {
            var msg = Blockly.Msg;
            // builtin controls_if
            var controlsIfId = "controls_if";
            var controlsIfDef = pxt.blocks.getBlockDefinition(controlsIfId);
            var controlsIfTooltips = controlsIfDef.tooltip;
            msg.CONTROLS_IF_MSG_IF = controlsIfDef.block["CONTROLS_IF_MSG_IF"];
            msg.CONTROLS_IF_MSG_THEN = controlsIfDef.block["CONTROLS_IF_MSG_THEN"];
            msg.CONTROLS_IF_MSG_ELSE = controlsIfDef.block["CONTROLS_IF_MSG_ELSE"];
            msg.CONTROLS_IF_MSG_ELSEIF = controlsIfDef.block["CONTROLS_IF_MSG_ELSEIF"];
            msg.CONTROLS_IF_TOOLTIP_1 = controlsIfTooltips["CONTROLS_IF_TOOLTIP_1"];
            msg.CONTROLS_IF_TOOLTIP_2 = controlsIfTooltips["CONTROLS_IF_TOOLTIP_2"];
            msg.CONTROLS_IF_TOOLTIP_3 = controlsIfTooltips["CONTROLS_IF_TOOLTIP_3"];
            msg.CONTROLS_IF_TOOLTIP_4 = controlsIfTooltips["CONTROLS_IF_TOOLTIP_4"];
            installBuiltinHelpInfo(controlsIfId);
            // builtin logic_compare
            var logicCompareId = "logic_compare";
            var logicCompareDef = pxt.blocks.getBlockDefinition(logicCompareId);
            var logicCompareTooltips = logicCompareDef.tooltip;
            msg.LOGIC_COMPARE_TOOLTIP_EQ = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_EQ"];
            msg.LOGIC_COMPARE_TOOLTIP_NEQ = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_NEQ"];
            msg.LOGIC_COMPARE_TOOLTIP_LT = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_LT"];
            msg.LOGIC_COMPARE_TOOLTIP_LTE = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_LTE"];
            msg.LOGIC_COMPARE_TOOLTIP_GT = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_GT"];
            msg.LOGIC_COMPARE_TOOLTIP_GTE = logicCompareTooltips["LOGIC_COMPARE_TOOLTIP_GTE"];
            installBuiltinHelpInfo(logicCompareId);
            // builtin logic_operation
            var logicOperationId = "logic_operation";
            var logicOperationDef = pxt.blocks.getBlockDefinition(logicOperationId);
            var logicOperationTooltips = logicOperationDef.tooltip;
            msg.LOGIC_OPERATION_AND = logicOperationDef.block["LOGIC_OPERATION_AND"];
            msg.LOGIC_OPERATION_OR = logicOperationDef.block["LOGIC_OPERATION_OR"];
            msg.LOGIC_OPERATION_TOOLTIP_AND = logicOperationTooltips["LOGIC_OPERATION_TOOLTIP_AND"];
            msg.LOGIC_OPERATION_TOOLTIP_OR = logicOperationTooltips["LOGIC_OPERATION_TOOLTIP_OR"];
            installBuiltinHelpInfo(logicOperationId);
            // builtin logic_negate
            var logicNegateId = "logic_negate";
            var logicNegateDef = pxt.blocks.getBlockDefinition(logicNegateId);
            msg.LOGIC_NEGATE_TITLE = logicNegateDef.block["LOGIC_NEGATE_TITLE"];
            installBuiltinHelpInfo(logicNegateId);
            // builtin logic_boolean
            var logicBooleanId = "logic_boolean";
            var logicBooleanDef = pxt.blocks.getBlockDefinition(logicBooleanId);
            msg.LOGIC_BOOLEAN_TRUE = logicBooleanDef.block["LOGIC_BOOLEAN_TRUE"];
            msg.LOGIC_BOOLEAN_FALSE = logicBooleanDef.block["LOGIC_BOOLEAN_FALSE"];
            installBuiltinHelpInfo(logicBooleanId);
        }
        function initText() {
            // builtin text
            var textInfo = pxt.blocks.getBlockDefinition('text');
            installHelpResources('text', textInfo.name, textInfo.tooltip, textInfo.url, Blockly.Colours.textField, Blockly.Colours.textField, Blockly.Colours.textField);
            // builtin text_length
            var msg = Blockly.Msg;
            var textLengthId = "text_length";
            var textLengthDef = pxt.blocks.getBlockDefinition(textLengthId);
            msg.TEXT_LENGTH_TITLE = textLengthDef.block["TEXT_LENGTH_TITLE"];
            // We have to override this block definition because the builtin block
            // allows both Strings and Arrays in its input check and that confuses
            // our Blockly compiler
            var block = Blockly.Blocks[textLengthId];
            block.init = function () {
                this.jsonInit({
                    "message0": msg.TEXT_LENGTH_TITLE,
                    "args0": [
                        {
                            "type": "input_value",
                            "name": "VALUE",
                            "check": ['String']
                        }
                    ],
                    "output": 'Number',
                    "outputShape": Blockly.OUTPUT_SHAPE_ROUND
                });
            };
            installBuiltinHelpInfo(textLengthId);
            // builtin text_join
            var textJoinId = "text_join";
            var textJoinDef = pxt.blocks.getBlockDefinition(textJoinId);
            msg.TEXT_JOIN_TITLE_CREATEWITH = textJoinDef.block["TEXT_JOIN_TITLE_CREATEWITH"];
            installBuiltinHelpInfo(textJoinId);
        }
        function initDebugger() {
            Blockly.Blocks[pxtc.TS_DEBUGGER_TYPE] = {
                init: function () {
                    var that = this;
                    that.setColour(pxt.toolbox.getNamespaceColor('debug'));
                    that.setPreviousStatement(true);
                    that.setNextStatement(true);
                    that.setInputsInline(false);
                    that.appendDummyInput('ON_OFF')
                        .appendField(new Blockly.FieldLabel(lf("breakpoint"), undefined), "DEBUGGER")
                        .appendField(new pxtblockly.FieldBreakpoint("1", { 'type': 'number' }), "ON_OFF");
                    setHelpResources(this, pxtc.TS_DEBUGGER_TYPE, lf("Debugger statement"), lf("A debugger statement invokes any available debugging functionality"), '/javascript/debugger', pxt.toolbox.getNamespaceColor('debug'));
                }
            };
        }
        function initComments() {
            Blockly.Msg.WORKSPACE_COMMENT_DEFAULT_TEXT = '';
        }
        function initTooltip() {
            var renderTip = function (el) {
                if (el.disabled)
                    return lf("This block is disabled and will not run. Attach this block to an event to enable it.");
                var tip = el.tooltip;
                while (goog.isFunction(tip)) {
                    tip = tip(el);
                }
                return tip;
            };
            /**
             * Override Blockly tooltip rendering with our own.
             * TODO shakao check if tooltip can be modified in a cleaner way
             * @private
             */
            Blockly.Tooltip.show_ = function () {
                var BlocklyTooltip = Blockly.Tooltip;
                BlocklyTooltip.poisonedElement_ = BlocklyTooltip.element_;
                if (!Blockly.Tooltip.DIV) {
                    return;
                }
                // Erase all existing text.
                goog.dom.removeChildren(/** @type {!Element} */ (Blockly.Tooltip.DIV));
                // Get the new text.
                var card = BlocklyTooltip.element_.codeCard;
                function render() {
                    var rtl = BlocklyTooltip.element_.RTL;
                    var windowSize = goog.dom.getViewportSize();
                    // Display the tooltip.
                    var tooltip = Blockly.Tooltip.DIV;
                    tooltip.style.direction = rtl ? 'rtl' : 'ltr';
                    tooltip.style.display = 'block';
                    Blockly.Tooltip.visible = true;
                    // Move the tooltip to just below the cursor.
                    var anchorX = BlocklyTooltip.lastX_;
                    if (rtl) {
                        anchorX -= Blockly.Tooltip.OFFSET_X + tooltip.offsetWidth;
                    }
                    else {
                        anchorX += Blockly.Tooltip.OFFSET_X;
                    }
                    var anchorY = BlocklyTooltip.lastY_ + Blockly.Tooltip.OFFSET_Y;
                    if (anchorY + tooltip.offsetHeight >
                        windowSize.height + window.scrollY) {
                        // Falling off the bottom of the screen; shift the tooltip up.
                        anchorY -= tooltip.offsetHeight + 2 * Blockly.Tooltip.OFFSET_Y;
                    }
                    if (rtl) {
                        // Prevent falling off left edge in RTL mode.
                        anchorX = Math.max(Blockly.Tooltip.MARGINS - window.scrollX, anchorX);
                    }
                    else {
                        if (anchorX + tooltip.offsetWidth >
                            windowSize.width + window.scrollX - 2 * Blockly.Tooltip.MARGINS) {
                            // Falling off the right edge of the screen;
                            // clamp the tooltip on the edge.
                            anchorX = windowSize.width - tooltip.offsetWidth -
                                2 * Blockly.Tooltip.MARGINS;
                        }
                    }
                    tooltip.style.top = anchorY + 'px';
                    tooltip.style.left = anchorX + 'px';
                }
                if (card) {
                    var cardEl = pxt.docs.codeCard.render({
                        header: renderTip(BlocklyTooltip.element_)
                    });
                    Blockly.Tooltip.DIV.appendChild(cardEl);
                    render();
                }
                else {
                    var tip = renderTip(BlocklyTooltip.element_);
                    tip = Blockly.utils._string.wrap(tip, Blockly.Tooltip.LIMIT);
                    // Create new text, line by line.
                    var lines = tip.split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        var div = document.createElement('div');
                        div.appendChild(document.createTextNode(lines[i]));
                        Blockly.Tooltip.DIV.appendChild(div);
                    }
                    render();
                }
            };
        }
        function removeBlock(fn) {
            delete Blockly.Blocks[fn.attributes.blockId];
            delete cachedBlocks[fn.attributes.blockId];
        }
        /**
         * <block type="pxt_wait_until">
         *     <value name="PREDICATE">
         *          <shadow type="logic_boolean">
         *              <field name="BOOL">TRUE</field>
         *          </shadow>
         *     </value>
         * </block>
         */
        function mkPredicateBlock(type) {
            var block = document.createElement("block");
            block.setAttribute("type", type);
            var value = document.createElement("value");
            value.setAttribute("name", "PREDICATE");
            block.appendChild(value);
            var shadow = mkFieldBlock("logic_boolean", "BOOL", "TRUE", true);
            value.appendChild(shadow);
            return block;
        }
        blocks.mkPredicateBlock = mkPredicateBlock;
        function mkFieldBlock(type, fieldName, fieldValue, isShadow) {
            var fieldBlock = document.createElement(isShadow ? "shadow" : "block");
            fieldBlock.setAttribute("type", pxt.Util.htmlEscape(type));
            var field = document.createElement("field");
            field.setAttribute("name", pxt.Util.htmlEscape(fieldName));
            field.textContent = pxt.Util.htmlEscape(fieldValue);
            fieldBlock.appendChild(field);
            return fieldBlock;
        }
        blocks.mkFieldBlock = mkFieldBlock;
        function mkReturnStatementBlock() {
            var block = document.createElement("block");
            block.setAttribute("type", "function_return");
            var value = document.createElement("value");
            value.setAttribute("name", "RETURN_VALUE");
            block.appendChild(value);
            var shadow = mkFieldBlock("math_number", "NUM", "0", true);
            value.appendChild(shadow);
            return block;
        }
        blocks.mkReturnStatementBlock = mkReturnStatementBlock;
        var jresIconCache = {};
        function iconToFieldImage(id) {
            var url = jresIconCache[id];
            if (!url) {
                pxt.log("missing jres icon " + id);
                return undefined;
            }
            return new Blockly.FieldImage(url, 40, 40, '', null, pxt.Util.isUserLanguageRtl());
        }
        function initJresIcons(blockInfo) {
            jresIconCache = {}; // clear previous cache
            var jres = blockInfo.apis.jres;
            if (!jres)
                return;
            Object.keys(jres).forEach(function (jresId) {
                var jresObject = jres[jresId];
                if (jresObject && jresObject.icon)
                    jresIconCache[jresId] = jresObject.icon;
            });
        }
        function splitInputs(def) {
            var res = [];
            var current = [];
            def.parts.forEach(function (part) {
                switch (part.kind) {
                    case "break":
                        newInput();
                        break;
                    case "param":
                        current.push(part);
                        newInput();
                        break;
                    case "image":
                    case "label":
                        current.push(part);
                        break;
                }
            });
            newInput();
            return res;
            function newInput() {
                if (current.length) {
                    res.push(current);
                    current = [];
                }
            }
        }
        function namedField(field, name) {
            return { field: field, name: name };
        }
        function getEnumDropdownValues(apis, enumName) {
            return pxt.Util.values(apis.byQName).filter(function (sym) { return sym.namespace === enumName && !sym.attributes.blockHidden; });
        }
        function getFixedInstanceDropdownValues(apis, qName) {
            return pxt.Util.values(apis.byQName).filter(function (sym) { return sym.kind === 4 /* Variable */
                && sym.attributes.fixedInstance
                && isSubtype(apis, sym.retType, qName); });
        }
        blocks.getFixedInstanceDropdownValues = getFixedInstanceDropdownValues;
        function generateIcons(instanceSymbols) {
            var imgConv = new pxt.ImageConverter();
            instanceSymbols.forEach(function (v) {
                if (v.attributes.jresURL && !v.attributes.iconURL && pxt.U.startsWith(v.attributes.jresURL, "data:image/x-mkcd-f")) {
                    v.attributes.iconURL = imgConv.convert(v.attributes.jresURL);
                }
            });
        }
        blocks.generateIcons = generateIcons;
        function getConstantDropdownValues(apis, qName) {
            return pxt.Util.values(apis.byQName).filter(function (sym) { return sym.attributes.blockIdentity === qName; });
        }
        // Trims off a single space from beginning and end (if present)
        function removeOuterSpace(str) {
            if (str === " ") {
                return "";
            }
            else if (str.length > 1) {
                var startSpace = str.charAt(0) == " ";
                var endSpace = str.charAt(str.length - 1) == " ";
                if (startSpace || endSpace) {
                    return str.substring(startSpace ? 1 : 0, endSpace ? str.length - 1 : str.length);
                }
            }
            return str;
        }
        /**
         * Blockly variable fields can't be set directly; you either have to use the
         * variable ID or set the value of the model and not the field
         */
        function setVarFieldValue(block, fieldName, newName) {
            var varField = block.getField(fieldName);
            // Check for an existing model with this name; otherwise we'll create
            // a second variable with the same name and it will show up twice in the UI
            var vars = block.workspace.getAllVariables();
            var foundIt = false;
            if (vars && vars.length) {
                for (var v = 0; v < vars.length; v++) {
                    var model = vars[v];
                    if (model.name === newName) {
                        varField.setValue(model.getId());
                        foundIt = true;
                    }
                }
            }
            if (!foundIt) {
                varField.initModel();
                var model = varField.getVariable();
                model.name = newName;
                varField.setValue(model.getId());
            }
        }
        blocks.setVarFieldValue = setVarFieldValue;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        var MutatorTypes;
        (function (MutatorTypes) {
            MutatorTypes.ObjectDestructuringMutator = "objectdestructuring";
            MutatorTypes.RestParameterMutator = "restparameter";
            MutatorTypes.DefaultInstanceMutator = "defaultinstance";
        })(MutatorTypes = blocks.MutatorTypes || (blocks.MutatorTypes = {}));
        function addMutation(b, info, mutationType) {
            var m;
            switch (mutationType) {
                case MutatorTypes.ObjectDestructuringMutator:
                    if (!info.parameters || info.parameters.length < 1) {
                        console.error("Destructuring mutations require at least one parameter");
                    }
                    else {
                        var found = false;
                        for (var _i = 0, _a = info.parameters; _i < _a.length; _i++) {
                            var param = _a[_i];
                            if (param.type.indexOf("=>") !== -1) {
                                if (!param.properties || param.properties.length === 0) {
                                    console.error("Destructuring mutations only supported for functions with an event parameter that has multiple properties");
                                    return;
                                }
                                found = true;
                            }
                        }
                        if (!found) {
                            console.error("Destructuring mutations must have an event parameter");
                            return;
                        }
                    }
                    m = new DestructuringMutator(b, info);
                    break;
                case MutatorTypes.RestParameterMutator:
                    m = new ArrayMutator(b, info);
                    break;
                case MutatorTypes.DefaultInstanceMutator:
                    m = new DefaultInstanceMutator(b, info);
                    break;
                default:
                    console.warn("Ignoring unknown mutation type: " + mutationType);
                    return;
            }
            b.mutationToDom = m.mutationToDom.bind(m);
            b.domToMutation = m.domToMutation.bind(m);
            b.compose = m.compose.bind(m);
            b.decompose = m.decompose.bind(m);
            b.mutation = m;
        }
        blocks.addMutation = addMutation;
        function mutateToolboxBlock(block, mutationType, mutation) {
            var mutationElement = document.createElement("mutation");
            switch (mutationType) {
                case MutatorTypes.ObjectDestructuringMutator:
                    mutationElement.setAttribute(DestructuringMutator.propertiesAttributeName, mutation);
                    break;
                case MutatorTypes.RestParameterMutator:
                    mutationElement.setAttribute(ArrayMutator.countAttributeName, mutation);
                    break;
                case MutatorTypes.DefaultInstanceMutator:
                    mutationElement.setAttribute(DefaultInstanceMutator.attributeName, mutation);
                default:
                    console.warn("Ignoring unknown mutation type: " + mutationType);
                    return;
            }
            block.appendChild(mutationElement);
        }
        blocks.mutateToolboxBlock = mutateToolboxBlock;
        var MutatorHelper = /** @class */ (function () {
            function MutatorHelper(b, info) {
                this.info = info;
                this.block = b;
                this.topBlockType = this.block.type + "_mutator";
                var subBlocks = this.getSubBlockNames();
                this.initializeMutatorTopBlock();
                this.initializeMutatorSubBlocks(subBlocks);
                var mutatorToolboxTypes = subBlocks.map(function (s) { return s.type; });
                this.block.setMutator(new Blockly.Mutator(mutatorToolboxTypes));
            }
            // Should be set to modify a block after a mutator dialog is updated
            MutatorHelper.prototype.compose = function (topBlock) {
                var allBlocks = topBlock.getDescendants(false).map(function (subBlock) {
                    return {
                        type: subBlock.type,
                        name: subBlock.inputList[0].name
                    };
                });
                // Toss the top block
                allBlocks.shift();
                this.updateBlock(allBlocks);
            };
            // Should be set to initialize the workspace inside a mutator dialog and return the top block
            MutatorHelper.prototype.decompose = function (workspace) {
                // Initialize flyout workspace's top block and add sub-blocks based on visible parameters
                var topBlock = workspace.newBlock(this.topBlockType);
                topBlock.initSvg();
                var _loop_2 = function (input) {
                    if (input.name === MutatorHelper.mutatorStatmentInput) {
                        var currentConnection_1 = input.connection;
                        this_1.getVisibleBlockTypes().forEach(function (sub) {
                            var subBlock = workspace.newBlock(sub);
                            subBlock.initSvg();
                            currentConnection_1.connect(subBlock.previousConnection);
                            currentConnection_1 = subBlock.nextConnection;
                        });
                        return "break";
                    }
                };
                var this_1 = this;
                for (var _i = 0, _a = topBlock.inputList; _i < _a.length; _i++) {
                    var input = _a[_i];
                    var state_1 = _loop_2(input);
                    if (state_1 === "break")
                        break;
                }
                return topBlock;
            };
            MutatorHelper.prototype.compileMutation = function (e, comments) {
                return undefined;
            };
            MutatorHelper.prototype.getDeclaredVariables = function () {
                return undefined;
            };
            MutatorHelper.prototype.isDeclaredByMutation = function (varName) {
                return false;
            };
            MutatorHelper.prototype.initializeMutatorSubBlock = function (sub, parameter, colour) {
                sub.appendDummyInput(parameter)
                    .appendField(parameter);
                sub.setColour(colour);
                sub.setNextStatement(true);
                sub.setPreviousStatement(true);
            };
            MutatorHelper.prototype.initializeMutatorTopBlock = function () {
                var topBlockTitle = this.info.attributes.mutateText;
                var colour = this.block.getColour();
                Blockly.Blocks[this.topBlockType] = Blockly.Blocks[this.topBlockType] || {
                    init: function () {
                        var top = this;
                        top.appendDummyInput()
                            .appendField(topBlockTitle);
                        top.setColour(colour);
                        top.appendStatementInput(MutatorHelper.mutatorStatmentInput);
                    }
                };
            };
            MutatorHelper.prototype.initializeMutatorSubBlocks = function (subBlocks) {
                var colour = this.block.getColour();
                var initializer = this.initializeMutatorSubBlock.bind(this);
                subBlocks.forEach(function (blockName) {
                    Blockly.Blocks[blockName.type] = Blockly.Blocks[blockName.type] || {
                        init: function () { initializer(this, blockName.name, colour); }
                    };
                });
            };
            MutatorHelper.mutatorStatmentInput = "PROPERTIES";
            MutatorHelper.mutatedVariableInputName = "properties";
            return MutatorHelper;
        }());
        var DestructuringMutator = /** @class */ (function (_super) {
            __extends(DestructuringMutator, _super);
            function DestructuringMutator(b, info) {
                var _this = _super.call(this, b, info) || this;
                _this.currentlyVisible = [];
                _this.parameterRenames = {};
                _this.prefix = _this.info.attributes.mutatePrefix;
                _this.block.appendDummyInput(MutatorHelper.mutatedVariableInputName);
                _this.block.appendStatementInput("HANDLER")
                    .setCheck("null");
                return _this;
            }
            DestructuringMutator.prototype.getMutationType = function () {
                return MutatorTypes.ObjectDestructuringMutator;
            };
            DestructuringMutator.prototype.compileMutation = function (e, comments) {
                var _this = this;
                if (!this.info.attributes.mutatePropertyEnum && !this.parameters.length) {
                    return undefined;
                }
                var declarationString = this.parameters.map(function (param) {
                    var varField = _this.block.getField(param);
                    var declaredName = varField && varField.getText();
                    var escapedParam = blocks.escapeVarName(param, e);
                    if (declaredName !== param) {
                        _this.parameterRenames[param] = declaredName;
                        return param + ": " + blocks.escapeVarName(declaredName, e);
                    }
                    return escapedParam;
                }).join(", ");
                var functionString = "function ({ " + declarationString + " })";
                if (this.info.attributes.mutatePropertyEnum) {
                    return blocks.mkText(" [" + this.parameters.map(function (p) { return _this.info.attributes.mutatePropertyEnum + "." + p; }).join(", ") + "]," + functionString);
                }
                else {
                    return blocks.mkText(functionString);
                }
            };
            DestructuringMutator.prototype.getDeclaredVariables = function () {
                var _this = this;
                var result = {};
                this.parameters.forEach(function (param) {
                    result[_this.getVarFieldValue(param)] = _this.parameterTypes[param];
                });
                return result;
            };
            DestructuringMutator.prototype.isDeclaredByMutation = function (varName) {
                var _this = this;
                return this.parameters.some(function (param) { return _this.getVarFieldValue(param) === varName; });
            };
            DestructuringMutator.prototype.mutationToDom = function () {
                var _this = this;
                // Save the parameters that are currently visible to the DOM along with their names
                var mutation = document.createElement("mutation");
                var attr = this.parameters.map(function (param) {
                    var varName = _this.getVarFieldValue(param);
                    if (varName !== param) {
                        _this.parameterRenames[param] = pxt.Util.htmlEscape(varName);
                    }
                    return pxt.Util.htmlEscape(param);
                }).join(",");
                mutation.setAttribute(DestructuringMutator.propertiesAttributeName, attr);
                for (var parameter in this.parameterRenames) {
                    if (parameter === this.parameterRenames[parameter]) {
                        delete this.parameterRenames[parameter];
                    }
                }
                mutation.setAttribute(DestructuringMutator.renameAttributeName, JSON.stringify(this.parameterRenames));
                return mutation;
            };
            DestructuringMutator.prototype.domToMutation = function (xmlElement) {
                var _this = this;
                // Restore visible parameters based on saved DOM
                var savedParameters = xmlElement.getAttribute(DestructuringMutator.propertiesAttributeName);
                if (savedParameters) {
                    var split = savedParameters.split(",");
                    var properties_1 = [];
                    if (this.paramIndex === undefined) {
                        this.paramIndex = this.getParameterIndex();
                    }
                    split.forEach(function (saved) {
                        // Parse the old way of storing renames to maintain backwards compatibility
                        var parts = saved.split(":");
                        if (_this.info.parameters[_this.paramIndex].properties.some(function (p) { return p.name === parts[0]; })) {
                            properties_1.push({
                                property: parts[0],
                                newName: parts[1]
                            });
                        }
                    });
                    this.parameterRenames = undefined;
                    if (xmlElement.hasAttribute(DestructuringMutator.renameAttributeName)) {
                        try {
                            this.parameterRenames = JSON.parse(xmlElement.getAttribute(DestructuringMutator.renameAttributeName));
                        }
                        catch (e) {
                            console.warn("Ignoring invalid rename map in saved block mutation");
                        }
                    }
                    this.parameterRenames = this.parameterRenames || {};
                    // Create the fields for each property with default variable names
                    this.parameters = [];
                    properties_1.forEach(function (prop) {
                        _this.parameters.push(prop.property);
                        if (prop.newName && prop.newName !== prop.property) {
                            _this.parameterRenames[prop.property] = prop.newName;
                        }
                    });
                    this.updateVisibleProperties();
                    // Override any names that the user has changed
                    properties_1.filter(function (p) { return !!p.newName; }).forEach(function (p) { return _this.setVarFieldValue(p.property, p.newName); });
                }
            };
            DestructuringMutator.prototype.getVarFieldValue = function (fieldName) {
                var varField = this.block.getField(fieldName);
                return varField && varField.getText();
            };
            DestructuringMutator.prototype.setVarFieldValue = function (fieldName, newValue) {
                var varField = this.block.getField(fieldName);
                if (this.block.getField(fieldName)) {
                    blocks.setVarFieldValue(this.block, fieldName, newValue);
                }
            };
            DestructuringMutator.prototype.updateBlock = function (subBlocks) {
                var _this = this;
                this.parameters = [];
                // Ignore duplicate blocks
                subBlocks.forEach(function (p) {
                    if (_this.parameters.indexOf(p.name) === -1) {
                        _this.parameters.push(p.name);
                    }
                });
                this.updateVisibleProperties();
            };
            DestructuringMutator.prototype.getSubBlockNames = function () {
                var _this = this;
                this.parameters = [];
                this.parameterTypes = {};
                if (this.paramIndex === undefined) {
                    this.paramIndex = this.getParameterIndex();
                }
                return this.info.parameters[this.paramIndex].properties.map(function (property) {
                    // Used when compiling the destructured arguments
                    _this.parameterTypes[property.name] = property.type;
                    return {
                        type: _this.propertyId(property.name),
                        name: property.name
                    };
                });
            };
            DestructuringMutator.prototype.getVisibleBlockTypes = function () {
                var _this = this;
                return this.currentlyVisible.map(function (p) { return _this.propertyId(p); });
            };
            DestructuringMutator.prototype.updateVisibleProperties = function () {
                var _this = this;
                if (pxt.Util.listsEqual(this.currentlyVisible, this.parameters)) {
                    return;
                }
                var dummyInput = this.block.inputList.find(function (i) { return i.name === MutatorHelper.mutatedVariableInputName; });
                if (this.prefix && this.currentlyVisible.length === 0) {
                    dummyInput.appendField(this.prefix, DestructuringMutator.prefixLabel);
                }
                this.currentlyVisible.forEach(function (param) {
                    if (_this.parameters.indexOf(param) === -1) {
                        var name_9 = _this.getVarFieldValue(param);
                        // Persist renames
                        if (name_9 !== param) {
                            _this.parameterRenames[param] = name_9;
                        }
                        dummyInput.removeField(param);
                    }
                });
                this.parameters.forEach(function (param) {
                    if (_this.currentlyVisible.indexOf(param) === -1) {
                        var fieldValue = _this.parameterRenames[param] || param;
                        dummyInput.appendField(new Blockly.FieldVariable(fieldValue), param);
                    }
                });
                if (this.prefix && this.parameters.length === 0) {
                    dummyInput.removeField(DestructuringMutator.prefixLabel);
                }
                this.currentlyVisible = this.parameters;
            };
            DestructuringMutator.prototype.propertyId = function (property) {
                return this.block.type + "_" + property;
            };
            DestructuringMutator.prototype.getParameterIndex = function () {
                for (var i = 0; i < this.info.parameters.length; i++) {
                    if (this.info.parameters[i].type.indexOf("=>") !== -1) {
                        return i;
                    }
                }
                return undefined;
            };
            DestructuringMutator.propertiesAttributeName = "callbackproperties";
            DestructuringMutator.renameAttributeName = "renamemap";
            // Avoid clashes by starting labels with a number
            DestructuringMutator.prefixLabel = "0prefix_label_";
            return DestructuringMutator;
        }(MutatorHelper));
        var ArrayMutator = /** @class */ (function (_super) {
            __extends(ArrayMutator, _super);
            function ArrayMutator() {
                var _this = _super !== null && _super.apply(this, arguments) || this;
                _this.count = 0;
                return _this;
            }
            ArrayMutator.prototype.getMutationType = function () {
                return MutatorTypes.RestParameterMutator;
            };
            ArrayMutator.prototype.compileMutation = function (e, comments) {
                var values = [];
                this.forEachInput(function (block) { return values.push(blocks.compileExpression(e, block, comments)); });
                return blocks.mkGroup(values);
            };
            ArrayMutator.prototype.mutationToDom = function () {
                var mutation = document.createElement("mutation");
                mutation.setAttribute(ArrayMutator.countAttributeName, this.count.toString());
                return mutation;
            };
            ArrayMutator.prototype.domToMutation = function (xmlElement) {
                var attribute = xmlElement.getAttribute(ArrayMutator.countAttributeName);
                if (attribute) {
                    try {
                        this.count = parseInt(attribute);
                    }
                    catch (e) {
                        return;
                    }
                    for (var i = 0; i < this.count; i++) {
                        this.addNumberField(false, i);
                    }
                }
            };
            ArrayMutator.prototype.updateBlock = function (subBlocks) {
                if (subBlocks) {
                    var diff_1 = Math.abs(this.count - subBlocks.length);
                    if (this.count < subBlocks.length) {
                        for (var i = 0; i < diff_1; i++)
                            this.addNumberField(true, this.count);
                    }
                    else if (this.count > subBlocks.length) {
                        for (var i = 0; i < diff_1; i++)
                            this.removeNumberField();
                    }
                }
            };
            ArrayMutator.prototype.getSubBlockNames = function () {
                return [{
                        name: "Value",
                        type: ArrayMutator.entryTypeName
                    }];
            };
            ArrayMutator.prototype.getVisibleBlockTypes = function () {
                var result = [];
                this.forEachInput(function () { return result.push(ArrayMutator.entryTypeName); });
                return result;
            };
            ArrayMutator.prototype.addNumberField = function (isNewField, index) {
                var input = this.block.appendValueInput(ArrayMutator.valueInputPrefix + index).setCheck("Number");
                if (isNewField) {
                    var valueBlock = this.block.workspace.newBlock("math_number");
                    valueBlock.initSvg();
                    valueBlock.setShadow(true);
                    input.connection.connect(valueBlock.outputConnection);
                    this.block.workspace.render();
                    this.count++;
                }
            };
            ArrayMutator.prototype.removeNumberField = function () {
                if (this.count > 0) {
                    this.block.removeInput(ArrayMutator.valueInputPrefix + (this.count - 1));
                }
                this.count--;
            };
            ArrayMutator.prototype.forEachInput = function (cb) {
                for (var i = 0; i < this.count; i++) {
                    cb(this.block.getInputTargetBlock(ArrayMutator.valueInputPrefix + i), i);
                }
            };
            ArrayMutator.countAttributeName = "count";
            ArrayMutator.entryTypeName = "entry";
            ArrayMutator.valueInputPrefix = "value_input_";
            return ArrayMutator;
        }(MutatorHelper));
        var DefaultInstanceMutator = /** @class */ (function (_super) {
            __extends(DefaultInstanceMutator, _super);
            function DefaultInstanceMutator() {
                var _this = _super !== null && _super.apply(this, arguments) || this;
                _this.showing = false;
                return _this;
            }
            DefaultInstanceMutator.prototype.getMutationType = function () {
                return MutatorTypes.DefaultInstanceMutator;
            };
            DefaultInstanceMutator.prototype.compileMutation = function (e, comments) {
                if (this.showing) {
                    var target = this.block.getInputTargetBlock(DefaultInstanceMutator.instanceInputName);
                    if (target) {
                        return blocks.compileExpression(e, target, comments);
                    }
                }
                return undefined;
            };
            DefaultInstanceMutator.prototype.mutationToDom = function () {
                var mutation = document.createElement("mutation");
                mutation.setAttribute(DefaultInstanceMutator.attributeName, this.showing ? "true" : "false");
                return mutation;
            };
            DefaultInstanceMutator.prototype.domToMutation = function (xmlElement) {
                var attribute = xmlElement.getAttribute(DefaultInstanceMutator.attributeName);
                if (attribute) {
                    this.updateShape(attribute === "true");
                }
                else {
                    this.updateShape(false);
                }
            };
            DefaultInstanceMutator.prototype.updateBlock = function (subBlocks) {
                this.updateShape(!!(subBlocks && subBlocks.length));
            };
            DefaultInstanceMutator.prototype.getSubBlockNames = function () {
                return [{
                        name: "Instance",
                        type: DefaultInstanceMutator.instanceSubBlockType
                    }];
            };
            DefaultInstanceMutator.prototype.getVisibleBlockTypes = function () {
                var result = [];
                if (this.showing) {
                    result.push(DefaultInstanceMutator.instanceSubBlockType);
                }
                return result;
            };
            DefaultInstanceMutator.prototype.updateShape = function (show) {
                if (this.showing !== show) {
                    if (show && !this.block.getInputTargetBlock(DefaultInstanceMutator.instanceInputName)) {
                        this.block.appendValueInput(DefaultInstanceMutator.instanceInputName);
                    }
                    else {
                        this.block.removeInput(DefaultInstanceMutator.instanceInputName);
                    }
                    this.showing = show;
                }
            };
            DefaultInstanceMutator.attributeName = "showing";
            DefaultInstanceMutator.instanceInputName = "__instance__";
            DefaultInstanceMutator.instanceSubBlockType = "instance";
            return DefaultInstanceMutator;
        }(MutatorHelper));
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/pxtblockly.d.ts" />
/// <reference path="../built/pxtlib.d.ts" />
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks_5) {
        var workspace;
        var blocklyDiv;
        var BlockLayout;
        (function (BlockLayout) {
            BlockLayout[BlockLayout["None"] = 0] = "None";
            BlockLayout[BlockLayout["Align"] = 1] = "Align";
            // Shuffle deprecated
            BlockLayout[BlockLayout["Clean"] = 3] = "Clean";
            BlockLayout[BlockLayout["Flow"] = 4] = "Flow";
        })(BlockLayout = blocks_5.BlockLayout || (blocks_5.BlockLayout = {}));
        function initRenderingWorkspace() {
            if (!workspace) {
                blocklyDiv = document.createElement("div");
                blocklyDiv.style.position = "absolute";
                blocklyDiv.style.top = "0";
                blocklyDiv.style.left = "0";
                blocklyDiv.style.width = "1px";
                blocklyDiv.style.height = "1px";
                document.body.appendChild(blocklyDiv);
                workspace = Blockly.inject(blocklyDiv, {
                    move: {
                        scrollbars: false
                    },
                    readOnly: true,
                    sounds: false,
                    media: pxt.webConfig.commitCdnUrl + "blockly/media/",
                    rtl: pxt.Util.isUserLanguageRtl(),
                    renderer: "pxt"
                });
            }
            pxt.blocks.clearWithoutEvents(workspace);
            return workspace;
        }
        blocks_5.initRenderingWorkspace = initRenderingWorkspace;
        function cleanRenderingWorkspace() {
            // We re-use the workspace across renders, catch any errors so we know to
            // create a new workspace if there was an error
            if (workspace)
                workspace.dispose();
            workspace = undefined;
        }
        blocks_5.cleanRenderingWorkspace = cleanRenderingWorkspace;
        function renderWorkspace(options) {
            if (options === void 0) { options = { emPixels: 18, layout: BlockLayout.Align }; }
            var layout = options.splitSvg ? BlockLayout.Align : (options.layout || BlockLayout.Flow);
            switch (layout) {
                case BlockLayout.Align:
                    pxt.blocks.layout.verticalAlign(workspace, options.emPixels || 18);
                    break;
                case BlockLayout.Flow:
                    pxt.blocks.layout.flow(workspace, { ratio: options.aspectRatio, useViewWidth: options.useViewWidth });
                    break;
                case BlockLayout.Clean:
                    if (workspace.cleanUp_)
                        workspace.cleanUp_();
                    break;
                default: // do nothing
                    break;
            }
            var metrics = workspace.getMetrics();
            var svg = blocklyDiv.querySelectorAll('svg')[0].cloneNode(true);
            pxt.blocks.layout.cleanUpBlocklySvg(svg);
            pxt.U.toArray(svg.querySelectorAll('.blocklyBlockCanvas,.blocklyBubbleCanvas'))
                .forEach(function (el) { return el.setAttribute('transform', "translate(" + -metrics.contentLeft + ", " + -metrics.contentTop + ") scale(1)"); });
            svg.setAttribute('viewBox', "0 0 " + metrics.contentWidth + " " + metrics.contentHeight);
            if (options.emPixels) {
                svg.style.width = (metrics.contentWidth / options.emPixels) + 'em';
                svg.style.height = (metrics.contentHeight / options.emPixels) + 'em';
            }
            return options.splitSvg
                ? pxt.blocks.layout.splitSvg(svg, workspace, options.emPixels)
                : svg;
        }
        blocks_5.renderWorkspace = renderWorkspace;
        function render(blocksXml, options) {
            if (options === void 0) { options = { emPixels: 18, layout: BlockLayout.Align }; }
            initRenderingWorkspace();
            try {
                var text = blocksXml || "<xml xmlns=\"http://www.w3.org/1999/xhtml\"></xml>";
                var xml = Blockly.Xml.textToDom(text);
                pxt.blocks.domToWorkspaceNoEvents(xml, workspace);
                return renderWorkspace(options);
            }
            catch (e) {
                pxt.reportException(e);
                cleanRenderingWorkspace();
                return undefined;
            }
        }
        blocks_5.render = render;
        function blocksMetrics(ws) {
            var blocks = ws.getTopBlocks(false);
            if (!blocks.length)
                return { width: 0, height: 0 };
            var m = undefined;
            blocks.forEach(function (b) {
                var r = b.getBoundingRectangle();
                if (!m)
                    m = { l: r.left, r: r.right, t: r.top, b: r.bottom };
                else {
                    m.l = Math.min(m.l, r.left);
                    m.r = Math.max(m.r, r.right);
                    m.t = Math.min(m.t, r.top);
                    m.b = Math.min(m.b, r.bottom);
                }
            });
            return {
                width: m.r - m.l,
                height: m.b - m.t
            };
        }
        blocks_5.blocksMetrics = blocksMetrics;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/blockly.d.ts" />
/// <reference path="../built/pxtlib.d.ts" />
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks_6) {
        function findRootBlocks(xmlDOM, type) {
            var blocks = [];
            for (var child in xmlDOM.children) {
                var xmlChild = xmlDOM.children[child];
                if (xmlChild.tagName === 'block') {
                    if (type) {
                        var childType = xmlChild.getAttribute('type');
                        if (childType && childType === type) {
                            blocks.push(xmlChild);
                        }
                    }
                    else {
                        blocks.push(xmlChild);
                    }
                }
                else {
                    var childChildren = findRootBlock(xmlChild);
                    if (childChildren) {
                        blocks = blocks.concat(childChildren);
                    }
                }
            }
            return blocks;
        }
        blocks_6.findRootBlocks = findRootBlocks;
        function findRootBlock(xmlDOM, type) {
            var blks = findRootBlocks(xmlDOM, type);
            if (blks.length)
                return blks[0];
            return null;
        }
        blocks_6.findRootBlock = findRootBlock;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var docs;
    (function (docs) {
        var codeCard;
        (function (codeCard) {
            function render(card, options) {
                if (options === void 0) { options = {}; }
                var url = card.url ? /^[^:]+:\/\//.test(card.url) ? card.url : ('/' + card.url.replace(/^\.?\/?/, ''))
                    : card.youTubeId ? "https://youtu.be/" + card.youTubeId : undefined;
                var link = !!url;
                var div = function (parent, cls, tag, text) {
                    if (tag === void 0) { tag = "div"; }
                    if (text === void 0) { text = ''; }
                    var d = document.createElement(tag);
                    if (cls)
                        d.className = cls;
                    if (parent)
                        parent.appendChild(d);
                    if (text)
                        d.appendChild(document.createTextNode(text + ''));
                    return d;
                };
                var style = card.style || "card";
                var r = div(null, 'ui ' + style + ' ' + (card.color || '') + (link ? ' link' : ''), link ? "a" : "div");
                r.setAttribute("role", "option");
                r.setAttribute("aria-selected", "true");
                if (link) {
                    var rAsLink = r;
                    rAsLink.href = url;
                    // pop out external links
                    if (/^https?:\/\//.test(url)) {
                        rAsLink.target = "_blank";
                    }
                }
                if (!options.hideHeader && card.header) {
                    var h = div(r, "ui content " + (card.responsive ? " tall desktop only" : ""));
                    if (card.header)
                        div(h, 'description', 'span', card.header);
                }
                var name = (options.shortName ? card.shortName : '') || card.name;
                var img = div(r, "ui image" + (card.responsive ? " tall landscape only" : ""));
                if (card.label) {
                    var lbl = document.createElement("label");
                    lbl.className = "ui " + (card.labelClass ? card.labelClass : "orange right ribbon") + " label";
                    lbl.textContent = card.label;
                    img.appendChild(lbl);
                }
                if (card.blocksXml) {
                    var svg = pxt.blocks.render(card.blocksXml);
                    if (!svg) {
                        console.error("failed to render blocks");
                        pxt.debug(card.blocksXml);
                    }
                    else {
                        var holder = div(img, '');
                        holder.setAttribute('style', 'width:100%; min-height:10em');
                        holder.appendChild(svg);
                    }
                }
                if (card.typeScript) {
                    var pre = document.createElement("pre");
                    pre.appendChild(document.createTextNode(card.typeScript));
                    img.appendChild(pre);
                }
                var imgUrl = card.imageUrl || (card.youTubeId ? "https://img.youtube.com/vi/" + card.youTubeId + "/0.jpg" : undefined);
                if (imgUrl) {
                    var imageWrapper = document.createElement("div");
                    imageWrapper.className = "ui imagewrapper";
                    var image = document.createElement("div");
                    image.className = "ui cardimage";
                    image.style.backgroundImage = "url(\"" + card.imageUrl + "\")";
                    image.title = name;
                    image.setAttribute("role", "presentation");
                    imageWrapper.appendChild(image);
                    img.appendChild(imageWrapper);
                }
                if (card.cardType == "file") {
                    var file = div(r, "ui fileimage");
                    img.appendChild(file);
                }
                if (name || card.description) {
                    var ct = div(r, "ui content");
                    if (name) {
                        r.setAttribute("aria-label", name);
                        div(ct, 'header', 'div', name);
                    }
                    if (card.description) {
                        var descr = div(ct, 'ui description');
                        var shortenedDescription = card.description.split('.')[0] + '.';
                        descr.appendChild(document.createTextNode(shortenedDescription));
                    }
                }
                if (card.time) {
                    var meta = div(r, "meta");
                    if (card.time) {
                        var m = div(meta, "date", "span");
                        m.appendChild(document.createTextNode(pxt.Util.timeSince(card.time)));
                    }
                }
                if (card.extracontent) {
                    var extracontent = div(r, "extra content", "div");
                    extracontent.appendChild(document.createTextNode(card.extracontent));
                }
                return r;
            }
            codeCard.render = render;
        })(codeCard = docs.codeCard || (docs.codeCard = {}));
    })(docs = pxt.docs || (pxt.docs = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/blockly.d.ts" />
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        function appendMutation(block, mutation) {
            var b = block;
            var oldMTD = b.mutationToDom;
            var oldDTM = b.domToMutation;
            b.mutationToDom = function () {
                var el = oldMTD ? oldMTD() : document.createElement("mutation");
                return mutation.mutationToDom(el);
            };
            b.domToMutation = function (saved) {
                if (oldDTM) {
                    oldDTM(saved);
                }
                mutation.domToMutation(saved);
            };
        }
        blocks.appendMutation = appendMutation;
        function initVariableArgsBlock(b, handlerArgs) {
            var currentlyVisible = 0;
            var actuallyVisible = 0;
            var i = b.appendDummyInput();
            var updateShape = function () {
                var _a;
                if (currentlyVisible === actuallyVisible) {
                    return;
                }
                if (currentlyVisible > actuallyVisible) {
                    var diff_2 = currentlyVisible - actuallyVisible;
                    for (var j = 0; j < diff_2; j++) {
                        var arg = handlerArgs[actuallyVisible + j];
                        i.insertFieldAt(i.fieldRow.length - 1, new pxtblockly.FieldArgumentVariable(arg.name), "HANDLER_" + arg.name);
                        var blockSvg = b;
                        if ((_a = blockSvg) === null || _a === void 0 ? void 0 : _a.initSvg)
                            blockSvg.initSvg(); // call initSvg on block to initialize new fields
                    }
                }
                else {
                    var diff_3 = actuallyVisible - currentlyVisible;
                    for (var j = 0; j < diff_3; j++) {
                        var arg = handlerArgs[actuallyVisible - j - 1];
                        i.removeField("HANDLER_" + arg.name);
                    }
                }
                if (currentlyVisible >= handlerArgs.length) {
                    i.removeField("_HANDLER_ADD");
                }
                else if (actuallyVisible >= handlerArgs.length) {
                    addPlusButton();
                }
                actuallyVisible = currentlyVisible;
            };
            Blockly.Extensions.apply('inline-svgs', b, false);
            addPlusButton();
            appendMutation(b, {
                mutationToDom: function (el) {
                    el.setAttribute("numArgs", currentlyVisible.toString());
                    for (var j = 0; j < currentlyVisible; j++) {
                        var varField = b.getField("HANDLER_" + handlerArgs[j].name);
                        var varName = varField && varField.getText();
                        el.setAttribute("arg" + j, varName);
                    }
                    return el;
                },
                domToMutation: function (saved) {
                    var numArgs = parseInt(saved.getAttribute("numargs"));
                    currentlyVisible = Math.min(isNaN(numArgs) ? 0 : numArgs, handlerArgs.length);
                    updateShape();
                    for (var j = 0; j < currentlyVisible; j++) {
                        var varName = saved.getAttribute("arg" + j);
                        var fieldName = "HANDLER_" + handlerArgs[j].name;
                        if (b.getField(fieldName)) {
                            blocks.setVarFieldValue(b, fieldName, varName);
                        }
                    }
                }
            });
            function addPlusButton() {
                i.appendField(new Blockly.FieldImage(b.ADD_IMAGE_DATAURI, 24, 24, lf("Add argument"), function () {
                    currentlyVisible = Math.min(currentlyVisible + 1, handlerArgs.length);
                    updateShape();
                }, false), "_HANDLER_ADD");
            }
        }
        blocks.initVariableArgsBlock = initVariableArgsBlock;
        function initExpandableBlock(info, b, def, comp, toggle, addInputs) {
            // Add numbers before input names to prevent clashes with the ones added
            // by BlocklyLoader. The number makes it an invalid JS identifier
            var buttonAddName = "0_add_button";
            var buttonRemName = "0_rem_button";
            var numVisibleAttr = "_expanded";
            var inputInitAttr = "_input_init";
            var optionNames = def.parameters.map(function (p) { return p.name; });
            var totalOptions = def.parameters.length;
            var buttonDelta = toggle ? totalOptions : 1;
            var state = new MutationState(b);
            state.setEventsEnabled(false);
            state.setValue(numVisibleAttr, 0);
            state.setValue(inputInitAttr, false);
            state.setEventsEnabled(true);
            var addShown = false;
            var remShown = false;
            Blockly.Extensions.apply('inline-svgs', b, false);
            addPlusButton();
            appendMutation(b, {
                mutationToDom: function (el) {
                    // The reason we store the inputsInitialized variable separately from visibleOptions
                    // is because it's possible for the block to get into a state where all inputs are
                    // initialized but they aren't visible (i.e. the user hit the - button). Blockly
                    // gets upset if a block has a different number of inputs when it is saved and restored.
                    el.setAttribute(numVisibleAttr, state.getString(numVisibleAttr));
                    el.setAttribute(inputInitAttr, state.getString(inputInitAttr));
                    return el;
                },
                domToMutation: function (saved) {
                    state.setEventsEnabled(false);
                    if (saved.hasAttribute(inputInitAttr) && saved.getAttribute(inputInitAttr) == "true" && !state.getBoolean(inputInitAttr)) {
                        state.setValue(inputInitAttr, true);
                        initOptionalInputs();
                    }
                    if (saved.hasAttribute(numVisibleAttr)) {
                        var val = parseInt(saved.getAttribute(numVisibleAttr));
                        if (!isNaN(val)) {
                            var delta = val - (state.getNumber(numVisibleAttr) || 0);
                            if (state.getBoolean(inputInitAttr)) {
                                if (b.rendered || b.isInsertionMarker()) {
                                    updateShape(delta, true, b.isInsertionMarker());
                                }
                                else {
                                    state.setValue(numVisibleAttr, addDelta(delta));
                                }
                            }
                            else {
                                updateShape(delta, true);
                            }
                        }
                    }
                    state.setEventsEnabled(true);
                }
            });
            // Blockly only lets you hide an input once it is rendered, so we can't
            // hide the inputs in init() or domToMutation(). This will get executed after
            // the block is rendered
            setTimeout(function () {
                if (b.rendered && !b.workspace.isDragging()) {
                    updateShape(0, undefined, true);
                    updateButtons();
                }
            }, 1);
            // Set skipRender to true if the block is still initializing. Otherwise
            // the inputs will render before their shadow blocks are created and
            // leave behind annoying artifacts
            function updateShape(delta, skipRender, force) {
                if (skipRender === void 0) { skipRender = false; }
                if (force === void 0) { force = false; }
                var newValue = addDelta(delta);
                if (!force && !skipRender && newValue === state.getNumber(numVisibleAttr))
                    return;
                state.setValue(numVisibleAttr, newValue);
                var visibleOptions = newValue;
                if (!state.getBoolean(inputInitAttr) && visibleOptions > 0) {
                    initOptionalInputs();
                    if (!b.rendered) {
                        return;
                    }
                }
                var optIndex = 0;
                for (var i = 0; i < b.inputList.length; i++) {
                    var input = b.inputList[i];
                    if (pxt.Util.startsWith(input.name, blocks.optionalDummyInputPrefix)) {
                        // The behavior for dummy inputs (i.e. labels) is that whenever a parameter is revealed,
                        // all earlier labels are made visible as well. If the parameter is the last one in the
                        // block then all labels are made visible
                        setInputVisible(input, optIndex < visibleOptions || visibleOptions === totalOptions);
                    }
                    else if (pxt.Util.startsWith(input.name, blocks.optionalInputWithFieldPrefix) || optionNames.indexOf(input.name) !== -1) {
                        var visible = optIndex < visibleOptions;
                        setInputVisible(input, visible);
                        if (visible && input.connection && !input.connection.isConnected() && !b.isInsertionMarker()) {
                            var param = comp.definitionNameToParam[def.parameters[optIndex].name];
                            var shadow = blocks.createShadowValue(info, param);
                            if (shadow.tagName.toLowerCase() === "value") {
                                // Unwrap the block
                                shadow = shadow.firstElementChild;
                            }
                            Blockly.Events.disable();
                            var nb = Blockly.Xml.domToBlock(shadow, b.workspace);
                            if (nb) {
                                input.connection.connect(nb.outputConnection);
                            }
                            Blockly.Events.enable();
                        }
                        ++optIndex;
                    }
                }
                updateButtons();
                if (!skipRender)
                    b.render();
            }
            function addButton(name, uri, alt, delta) {
                b.appendDummyInput(name)
                    .appendField(new Blockly.FieldImage(uri, 24, 24, alt, function () { return updateShape(delta); }, false));
            }
            function updateButtons() {
                var visibleOptions = state.getNumber(numVisibleAttr);
                var showAdd = visibleOptions !== totalOptions;
                var showRemove = visibleOptions !== 0;
                if (!showAdd) {
                    addShown = false;
                    b.removeInput(buttonAddName, true);
                }
                if (!showRemove) {
                    remShown = false;
                    b.removeInput(buttonRemName, true);
                }
                if (showRemove && !remShown) {
                    if (addShown) {
                        b.removeInput(buttonAddName, true);
                        addMinusButton();
                        addPlusButton();
                    }
                    else {
                        addMinusButton();
                    }
                }
                if (showAdd && !addShown) {
                    addPlusButton();
                }
            }
            function addPlusButton() {
                addShown = true;
                addButton(buttonAddName, b.ADD_IMAGE_DATAURI, lf("Reveal optional arguments"), buttonDelta);
            }
            function addMinusButton() {
                remShown = true;
                addButton(buttonRemName, b.REMOVE_IMAGE_DATAURI, lf("Hide optional arguments"), -1 * buttonDelta);
            }
            function initOptionalInputs() {
                state.setValue(inputInitAttr, true);
                addInputs();
                updateButtons();
            }
            function addDelta(delta) {
                return Math.min(Math.max(state.getNumber(numVisibleAttr) + delta, 0), totalOptions);
            }
            function setInputVisible(input, visible) {
                // If the block isn't rendered, Blockly will crash
                if (b.rendered) {
                    var renderList = input.setVisible(visible);
                    renderList.forEach(function (block) {
                        block.render();
                    });
                }
            }
        }
        blocks.initExpandableBlock = initExpandableBlock;
        function initReturnStatement(b) {
            var returnDef = pxt.blocks.getBlockDefinition("function_return");
            var buttonAddName = "0_add_button";
            var buttonRemName = "0_rem_button";
            Blockly.Extensions.apply('inline-svgs', b, false);
            var returnValueVisible = true;
            updateShape();
            // When the value input is removed, we disconnect the block that was connected to it. This
            // is the id of whatever block was last connected
            var lastConnectedId;
            b.domToMutation = function (saved) {
                if (saved.hasAttribute("last_connected_id")) {
                    lastConnectedId = saved.getAttribute("last_connected_id");
                }
                returnValueVisible = hasReturnValue(saved);
                updateShape();
            };
            b.mutationToDom = function () {
                var mutation = document.createElement("mutation");
                setReturnValue(mutation, !!b.getInput("RETURN_VALUE"));
                if (lastConnectedId) {
                    mutation.setAttribute("last_connected_id", lastConnectedId);
                }
                return mutation;
            };
            function updateShape() {
                var returnValueInput = b.getInput("RETURN_VALUE");
                if (returnValueVisible) {
                    if (!returnValueInput) {
                        // Remove any labels
                        while (b.getInput(""))
                            b.removeInput("");
                        b.jsonInit({
                            "message0": returnDef.block["message_with_value"],
                            "args0": [
                                {
                                    "type": "input_value",
                                    "name": "RETURN_VALUE",
                                    "check": null
                                }
                            ],
                            "previousStatement": null,
                            "colour": pxt.toolbox.getNamespaceColor('functions')
                        });
                    }
                    if (b.getInput(buttonAddName)) {
                        b.removeInput(buttonAddName);
                    }
                    if (!b.getInput(buttonRemName)) {
                        addMinusButton();
                    }
                    if (lastConnectedId) {
                        var lastConnected = b.workspace.getBlockById(lastConnectedId);
                        if (lastConnected && lastConnected.outputConnection && !lastConnected.outputConnection.targetBlock()) {
                            b.getInput("RETURN_VALUE").connection.connect(lastConnected.outputConnection);
                        }
                        lastConnectedId = undefined;
                    }
                }
                else {
                    if (returnValueInput) {
                        var target = returnValueInput.connection.targetBlock();
                        if (target) {
                            if (target.isShadow())
                                target.setShadow(false);
                            returnValueInput.connection.disconnect();
                            lastConnectedId = target.id;
                        }
                        b.removeInput("RETURN_VALUE");
                        b.jsonInit({
                            "message0": returnDef.block["message_no_value"],
                            "args0": [],
                            "previousStatement": null,
                            "colour": pxt.toolbox.getNamespaceColor('functions')
                        });
                    }
                    if (b.getInput(buttonRemName)) {
                        b.removeInput(buttonRemName);
                    }
                    if (!b.getInput(buttonAddName)) {
                        addPlusButton();
                    }
                }
                b.setInputsInline(true);
            }
            function setReturnValue(mutation, hasReturnValue) {
                mutation.setAttribute("no_return_value", hasReturnValue ? "false" : "true");
            }
            function hasReturnValue(mutation) {
                return mutation.getAttribute("no_return_value") !== "true";
            }
            function addPlusButton() {
                addButton(buttonAddName, b.ADD_IMAGE_DATAURI, lf("Add return value"));
            }
            function addMinusButton() {
                addButton(buttonRemName, b.REMOVE_IMAGE_DATAURI, lf("Remove return value"));
            }
            function mutationString() {
                return Blockly.Xml.domToText(b.mutationToDom());
            }
            function fireMutationChange(pre, post) {
                if (pre !== post)
                    Blockly.Events.fire(new Blockly.Events.BlockChange(b, "mutation", null, pre, post));
            }
            function addButton(name, uri, alt) {
                b.appendDummyInput(name)
                    .appendField(new Blockly.FieldImage(uri, 24, 24, alt, function () {
                    var oldMutation = mutationString();
                    returnValueVisible = !returnValueVisible;
                    var preUpdate = mutationString();
                    fireMutationChange(oldMutation, preUpdate);
                    updateShape();
                    var postUpdate = mutationString();
                    fireMutationChange(preUpdate, postUpdate);
                }, false));
            }
        }
        blocks.initReturnStatement = initReturnStatement;
        var MutationState = /** @class */ (function () {
            function MutationState(block, initState) {
                this.block = block;
                this.fireEvents = true;
                this.state = initState || {};
            }
            MutationState.prototype.setValue = function (attr, value) {
                var _this = this;
                if (this.fireEvents && this.block.mutationToDom) {
                    var oldMutation_1 = this.block.mutationToDom();
                    this.state[attr] = value.toString();
                    var newMutation_1 = this.block.mutationToDom();
                    Object.keys(this.state).forEach(function (key) {
                        if (oldMutation_1.getAttribute(key) !== _this.state[key]) {
                            newMutation_1.setAttribute(key, _this.state[key]);
                        }
                    });
                    var oldText = Blockly.Xml.domToText(oldMutation_1);
                    var newText = Blockly.Xml.domToText(newMutation_1);
                    if (oldText != newText) {
                        Blockly.Events.fire(new Blockly.Events.BlockChange(this.block, "mutation", null, oldText, newText));
                    }
                }
                else {
                    this.state[attr] = value.toString();
                }
            };
            MutationState.prototype.getNumber = function (attr) {
                return parseInt(this.state[attr]);
            };
            MutationState.prototype.getBoolean = function (attr) {
                return this.state[attr] != "false";
            };
            MutationState.prototype.getString = function (attr) {
                return this.state[attr];
            };
            MutationState.prototype.setEventsEnabled = function (enabled) {
                this.fireEvents = enabled;
            };
            return MutationState;
        }());
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        var allOperations = pxt.blocks.MATH_FUNCTIONS.unary.concat(pxt.blocks.MATH_FUNCTIONS.binary).concat(pxt.blocks.MATH_FUNCTIONS.infix);
        function initMathOpBlock() {
            var mathOpId = "math_js_op";
            var mathOpDef = pxt.blocks.getBlockDefinition(mathOpId);
            Blockly.Blocks[mathOpId] = {
                init: function () {
                    var b = this;
                    b.setPreviousStatement(false);
                    b.setNextStatement(false);
                    b.setOutput(true, "Number");
                    b.setOutputShape(Blockly.OUTPUT_SHAPE_ROUND);
                    b.setInputsInline(true);
                    var ddi = b.appendDummyInput("op_dropdown");
                    ddi.appendField(new Blockly.FieldDropdown(allOperations.map(function (op) { return [mathOpDef.block[op], op]; }), function (op) { return onOperatorSelect(b, op); }), "OP");
                    addArgInput(b, false);
                    // Because the shape of inputs changes, we need a mutation. Technically the op tells us
                    // how many inputs we should have but we can't read its value at init time
                    blocks.appendMutation(b, {
                        mutationToDom: function (mutation) {
                            var infix;
                            for (var i = 0; i < b.inputList.length; i++) {
                                var input = b.inputList[i];
                                if (input.name === "op_dropdown") {
                                    infix = false;
                                    break;
                                }
                                else if (input.name === "ARG0") {
                                    infix = true;
                                    break;
                                }
                            }
                            mutation.setAttribute("op-type", (b.getInput("ARG1") ? (infix ? "infix" : "binary") : "unary").toString());
                            return mutation;
                        },
                        domToMutation: function (saved) {
                            if (saved.hasAttribute("op-type")) {
                                var type = saved.getAttribute("op-type");
                                if (type != "unary") {
                                    addArgInput(b, true);
                                }
                                changeInputOrder(b, type === "infix");
                            }
                        }
                    });
                }
            };
            blocks.installHelpResources(mathOpId, mathOpDef.name, function (block) {
                return mathOpDef.tooltip[block.getFieldValue("OP")];
            }, mathOpDef.url, pxt.toolbox.getNamespaceColor(mathOpDef.category));
            function onOperatorSelect(b, op) {
                if (isUnaryOp(op)) {
                    b.removeInput("ARG1", true);
                }
                else if (!b.getInput("ARG1")) {
                    addArgInput(b, true);
                }
                changeInputOrder(b, isInfixOp(op));
            }
            function addArgInput(b, second) {
                var i = b.appendValueInput("ARG" + (second ? 1 : 0));
                i.setCheck("Number");
                if (second) {
                    i.connection.setShadowDom(numberShadowDom());
                    i.connection.respawnShadow_();
                }
            }
            function changeInputOrder(b, infix) {
                var hasTwoArgs = !!b.getInput("ARG1");
                if (infix) {
                    if (hasTwoArgs) {
                        b.moveInputBefore("op_dropdown", "ARG1");
                    }
                    b.moveInputBefore("ARG0", "op_dropdown");
                }
                else {
                    if (hasTwoArgs) {
                        b.moveInputBefore("ARG0", "ARG1");
                    }
                    b.moveInputBefore("op_dropdown", "ARG0");
                }
            }
        }
        blocks.initMathOpBlock = initMathOpBlock;
        function isUnaryOp(op) {
            return pxt.blocks.MATH_FUNCTIONS.unary.indexOf(op) !== -1;
        }
        function isInfixOp(op) {
            return pxt.blocks.MATH_FUNCTIONS.infix.indexOf(op) !== -1;
        }
        var cachedDom;
        function numberShadowDom() {
            // <shadow type="math_number"><field name="NUM">0</field></shadow>
            if (!cachedDom) {
                cachedDom = document.createElement("shadow");
                cachedDom.setAttribute("type", "math_number");
                var field = document.createElement("field");
                field.setAttribute("name", "NUM");
                field.textContent = "0";
                cachedDom.appendChild(field);
            }
            return cachedDom;
        }
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        var allOperations = pxt.blocks.ROUNDING_FUNCTIONS;
        function initMathRoundBlock() {
            var mathRoundId = "math_js_round";
            var mathRoundDef = pxt.blocks.getBlockDefinition(mathRoundId);
            Blockly.Blocks[mathRoundId] = {
                init: function () {
                    var b = this;
                    b.setPreviousStatement(false);
                    b.setNextStatement(false);
                    b.setOutput(true, "Number");
                    b.setOutputShape(Blockly.OUTPUT_SHAPE_ROUND);
                    b.setInputsInline(true);
                    var ddi = b.appendDummyInput("round_dropdown");
                    ddi.appendField(new Blockly.FieldDropdown(allOperations.map(function (op) { return [mathRoundDef.block[op], op]; }), function (op) { return onOperatorSelect(b, op); }), "OP");
                    addArgInput(b);
                }
            };
            blocks.installHelpResources(mathRoundId, mathRoundDef.name, function (block) {
                return mathRoundDef.tooltip[block.getFieldValue("OP")];
            }, mathRoundDef.url, pxt.toolbox.getNamespaceColor(mathRoundDef.category));
            function onOperatorSelect(b, op) {
                // No-op
            }
            function addArgInput(b) {
                var i = b.appendValueInput("ARG0");
                i.setCheck("Number");
            }
        }
        blocks.initMathRoundBlock = initMathRoundBlock;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
/// <reference path="../../built/pxtlib.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var svg = pxt.svgUtil;
    // 32 is specifically chosen so that we can scale the images for the default
    // sprite sizes without getting browser anti-aliasing
    var PREVIEW_WIDTH = 32;
    var X_PADDING = 5;
    var Y_PADDING = 1;
    var BG_PADDING = 4;
    var BG_WIDTH = BG_PADDING * 2 + PREVIEW_WIDTH;
    var ICON_WIDTH = 30;
    var TOTAL_HEIGHT = Y_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH;
    var TOTAL_WIDTH = X_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH + ICON_WIDTH;
    var FieldAnimationEditor = /** @class */ (function (_super) {
        __extends(FieldAnimationEditor, _super);
        function FieldAnimationEditor(text, params, validator) {
            var _this = _super.call(this, text, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.onMouseEnter = function () {
                if (_this.animateRef)
                    return;
                var interval = _this.state.interval > 50 ? _this.state.interval : 50;
                var index = 0;
                _this.animateRef = setInterval(function () {
                    if (_this.preview && _this.frames[index])
                        _this.preview.src(_this.frames[index]);
                    index = (index + 1) % _this.frames.length;
                }, interval);
            };
            _this.onMouseLeave = function () {
                if (_this.animateRef)
                    clearInterval(_this.animateRef);
                _this.animateRef = undefined;
                if (_this.preview && _this.frames[0]) {
                    _this.preview.src(_this.frames[0]);
                }
            };
            _this.lightMode = params.lightMode;
            _this.params = parseFieldOptions(params);
            _this.blocksInfo = params.blocksInfo;
            _this.initState();
            return _this;
        }
        FieldAnimationEditor.prototype.init = function () {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
            if (!this.visible_) {
                this.fieldGroup_.style.display = 'none';
            }
            this.initState();
            this.redrawPreview();
            this.sourceBlock_.getSvgRoot().addEventListener("mouseenter", this.onMouseEnter);
            this.sourceBlock_.getSvgRoot().addEventListener("mouseleave", this.onMouseLeave);
            this.updateEditable();
            this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
            // Force a render.
            this.render_();
            this.mouseDownWrapper_ = Blockly.bindEventWithChecks_(this.getClickTarget_(), "mousedown", this, this.onMouseDown_);
            this.state.interval = this.getParentInterval();
        };
        FieldAnimationEditor.prototype.showEditor_ = function () {
            var _this = this;
            this.params.blocksInfo = this.blocksInfo;
            this.initState();
            var parentInterval = this.getParentInterval();
            if (!isNaN(parentInterval))
                this.state.interval = parentInterval;
            var fv = pxt.react.getFieldEditorView("animation-editor", this.state, this.params);
            if (this.undoRedoState) {
                fv.restorePersistentData(this.undoRedoState);
            }
            fv.onHide(function () {
                var result = fv.getResult();
                if (result) {
                    var old = _this.getValue();
                    _this.state = result;
                    if (!isNaN(_this.state.interval)) {
                        _this.setParentInterval(_this.state.interval);
                    }
                    _this.redrawPreview();
                    _this.undoRedoState = fv.getPersistentData();
                    if (_this.sourceBlock_ && Blockly.Events.isEnabled()) {
                        Blockly.Events.fire(new Blockly.Events.BlockChange(_this.sourceBlock_, 'field', _this.name, old, _this.getValue()));
                    }
                }
            });
            fv.show();
        };
        FieldAnimationEditor.prototype.render_ = function () {
            _super.prototype.render_.call(this);
            this.size_.height = TOTAL_HEIGHT;
            this.size_.width = TOTAL_WIDTH;
        };
        FieldAnimationEditor.prototype.getValue = function () {
            if (!this.state)
                return "[]";
            return "[" + this.state.frames.map(function (frame) {
                return pxt.sprite.bitmapToImageLiteral(pxt.sprite.Bitmap.fromData(frame), "typescript" /* TypeScript */);
            }).join(",") + "]";
        };
        FieldAnimationEditor.prototype.doValueUpdate_ = function (newValue) {
            if (newValue == null) {
                return;
            }
            this.value_ = newValue;
            var frames = parseImageArrayString(newValue);
            if (frames && frames.length) {
                this.initState();
                this.state.frames = frames;
            }
            this.redrawPreview();
            _super.prototype.doValueUpdate_.call(this, newValue);
        };
        FieldAnimationEditor.prototype.redrawPreview = function () {
            var _this = this;
            if (!this.fieldGroup_)
                return;
            pxsim.U.clear(this.fieldGroup_);
            var bg = new svg.Rect()
                .at(X_PADDING + ICON_WIDTH, Y_PADDING)
                .size(BG_WIDTH, BG_WIDTH)
                .corner(4)
                .setClass("blocklyAnimationField");
            this.fieldGroup_.appendChild(bg.el);
            var icon = new svg.Text("\uf008")
                .at(X_PADDING, 5 + (TOTAL_HEIGHT >> 1))
                .fill(this.sourceBlock_.getColourSecondary())
                .setClass("semanticIcon");
            this.fieldGroup_.appendChild(icon.el);
            if (this.state) {
                this.frames = this.state.frames.map(function (frame) { return pxtblockly.bitmapToImageURI(pxt.sprite.Bitmap.fromData(frame), PREVIEW_WIDTH, _this.lightMode); });
                this.preview = new svg.Image()
                    .src(this.frames[0])
                    .at(X_PADDING + BG_PADDING + ICON_WIDTH, Y_PADDING + BG_PADDING)
                    .size(PREVIEW_WIDTH, PREVIEW_WIDTH);
                this.fieldGroup_.appendChild(this.preview.el);
            }
        };
        FieldAnimationEditor.prototype.getParentIntervalBlock = function () {
            var s = this.sourceBlock_;
            if (s.parentBlock_) {
                var p = s.parentBlock_;
                for (var _i = 0, _a = p.inputList; _i < _a.length; _i++) {
                    var input = _a[_i];
                    if (input.name === "frameInterval") {
                        return input.connection.targetBlock();
                    }
                }
            }
            return undefined;
        };
        FieldAnimationEditor.prototype.setParentInterval = function (interval) {
            var target = this.getParentIntervalBlock();
            if (target) {
                var fieldName = getFieldName(target);
                if (fieldName) {
                    target.setFieldValue(String(interval), fieldName);
                }
            }
        };
        FieldAnimationEditor.prototype.getParentInterval = function () {
            var target = this.getParentIntervalBlock();
            if (target) {
                var fieldName = getFieldName(target);
                if (fieldName) {
                    return Number(target.getFieldValue(fieldName));
                }
            }
            return 100;
        };
        FieldAnimationEditor.prototype.initState = function () {
            if (!this.state) {
                if (this.params) {
                    this.state = {
                        frames: [new pxt.sprite.Bitmap(this.params.initWidth, this.params.initHeight).data()],
                        interval: 100
                    };
                }
                else {
                    this.state = {
                        frames: [],
                        interval: 100
                    };
                }
            }
        };
        return FieldAnimationEditor;
    }(Blockly.Field));
    pxtblockly.FieldAnimationEditor = FieldAnimationEditor;
    function parseFieldOptions(opts) {
        var parsed = {
            initWidth: 16,
            initHeight: 16,
        };
        if (!opts) {
            return parsed;
        }
        if (opts.filter) {
            parsed.filter = opts.filter;
        }
        parsed.initWidth = withDefault(opts.initWidth, parsed.initWidth);
        parsed.initHeight = withDefault(opts.initHeight, parsed.initHeight);
        return parsed;
        function withDefault(raw, def) {
            var res = parseInt(raw);
            if (isNaN(res)) {
                return def;
            }
            return res;
        }
    }
    function parseImageArrayString(str) {
        str = str.replace(/[\[\]]/mg, "");
        return str.split(",").map(function (s) { return pxt.sprite.imageLiteralToBitmap(s).data(); }).filter(function (b) { return b.height && b.width; });
    }
    function isNumberType(type) {
        return type === "math_number" || type === "math_integer" || type === "math_whole_number";
    }
    function getFieldName(target) {
        if (target.type === "math_number_minmax") {
            return "SLIDER";
        }
        else if (isNumberType(target.type)) {
            return "NUM";
        }
        else if (target.type === "timePicker") {
            return "ms";
        }
        return null;
    }
})(pxtblockly || (pxtblockly = {}));
var pxtblockly;
(function (pxtblockly) {
    /**
     * Subclass of FieldVariable to filter out the "delete" option when
     * variables are part of a function argument (or else the whole function
     * gets deleted).
    */
    var FieldArgumentVariable = /** @class */ (function (_super) {
        __extends(FieldArgumentVariable, _super);
        function FieldArgumentVariable(varName) {
            var _this = _super.call(this, varName) || this;
            _this.menuGenerator_ = _this.dropdownCreate;
            return _this;
        }
        FieldArgumentVariable.prototype.dropdownCreate = function () {
            var options = Blockly.FieldVariable.dropdownCreate.call(this);
            return options.filter(function (opt) { return opt[1] != Blockly.DELETE_VARIABLE_ID; });
        };
        return FieldArgumentVariable;
    }(Blockly.FieldVariable));
    pxtblockly.FieldArgumentVariable = FieldArgumentVariable;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="../../built/pxtsim.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldBreakpoint = /** @class */ (function (_super) {
        __extends(FieldBreakpoint, _super);
        function FieldBreakpoint(state, params, opt_validator) {
            var _this = _super.call(this, state, undefined, undefined, undefined, opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.CURSOR = 'pointer';
            _this.params = params;
            _this.setValue(state);
            _this.addArgType('toggle');
            _this.type_ = params.type;
            return _this;
        }
        FieldBreakpoint.prototype.init = function () {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
            if (!this.visible_) {
                this.fieldGroup_.style.display = 'none';
            }
            // Add an attribute to cassify the type of field.
            if (this.getArgTypes() !== null) {
                if (this.sourceBlock_.isShadow()) {
                    this.sourceBlock_.svgGroup_.setAttribute('data-argument-type', this.getArgTypes());
                }
                else {
                    // Fields without a shadow wrapper, like square dropdowns.
                    this.fieldGroup_.setAttribute('data-argument-type', this.getArgTypes());
                }
            }
            // Adjust X to be flipped for RTL. Position is relative to horizontal start of source block.
            var size = this.getSize();
            this.checkElement_ = Blockly.utils.dom.createSvgElement('g', {
                'class': "blocklyToggle " + (this.state_ ? 'blocklyToggleOnBreakpoint' : 'blocklyToggleOffBreakpoint'),
                'transform': "translate(8, " + size.height / 2 + ")",
            }, this.fieldGroup_);
            this.toggleThumb_ = Blockly.utils.dom.createSvgElement('polygon', {
                'class': 'blocklyToggleRect',
                'points': '50,5 100,5 125,30 125,80 100,105 50,105 25,80 25,30'
            }, this.checkElement_);
            var fieldX = (this.sourceBlock_.RTL) ? -size.width / 2 : size.width / 2;
            /** @type {!Element} */
            this.textElement_ = Blockly.utils.dom.createSvgElement('text', {
                'class': 'blocklyText',
                'x': fieldX,
                'dy': '0.6ex',
                'y': size.height / 2
            }, this.fieldGroup_);
            this.updateEditable();
            this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
            this.switchToggle(this.state_);
            this.setValue(this.getValue());
            // Force a render.
            this.render_();
            this.size_.width = 0;
            this.mouseDownWrapper_ =
                Blockly.bindEventWithChecks_(this.getClickTarget_(), 'mousedown', this, this.onMouseDown_);
        };
        FieldBreakpoint.prototype.updateSize_ = function () {
            this.size_.width = 30;
        };
        /**
         * Return 'TRUE' if the toggle is ON, 'FALSE' otherwise.
         * @return {string} Current state.
         */
        FieldBreakpoint.prototype.getValue = function () {
            return this.toVal(this.state_);
        };
        ;
        /**
         * Set the checkbox to be checked if newBool is 'TRUE' or true,
         * unchecks otherwise.
         * @param {string|boolean} newBool New state.
         */
        FieldBreakpoint.prototype.setValue = function (newBool) {
            var newState = this.fromVal(newBool);
            if (this.state_ !== newState) {
                if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
                    Blockly.Events.fire(new Blockly.Events.BlockChange(this.sourceBlock_, 'field', this.name, this.state_, newState));
                }
                this.state_ = newState;
                this.switchToggle(this.state_);
            }
        };
        FieldBreakpoint.prototype.switchToggle = function (newState) {
            if (this.checkElement_) {
                this.updateSize_();
                if (newState) {
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOnBreakpoint');
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOffBreakpoint');
                }
                else {
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOnBreakpoint');
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOffBreakpoint');
                }
                this.checkElement_.setAttribute('transform', "translate(-7, -1) scale(0.3)");
            }
        };
        FieldBreakpoint.prototype.updateDisplay_ = function (newValue) {
            _super.prototype.updateDisplay_.call(this, newValue);
            if (this.textElement_)
                pxt.BrowserUtils.addClass(this.textElement_, 'blocklyToggleText');
        };
        FieldBreakpoint.prototype.render_ = function () {
            if (this.visible_ && this.textElement_) {
                // Replace the text.
                goog.dom.removeChildren(/** @type {!Element} */ (this.textElement_));
                this.updateSize_();
            }
        };
        /**
         * Toggle the state of the toggle.
         * @private
         */
        FieldBreakpoint.prototype.showEditor_ = function () {
            var newState = !this.state_;
            /*
            if (this.sourceBlock_) {
              // Call any validation function, and allow it to override.
              newState = this.callValidator(newState);
            }*/
            if (newState !== null) {
                this.setValue(this.toVal(newState));
            }
        };
        FieldBreakpoint.prototype.toVal = function (newState) {
            if (this.type_ == "number")
                return String(newState ? '1' : '0');
            else
                return String(newState ? 'true' : 'false');
        };
        FieldBreakpoint.prototype.fromVal = function (val) {
            if (typeof val == "string") {
                if (val == "1" || val.toUpperCase() == "TRUE")
                    return true;
                return false;
            }
            return !!val;
        };
        return FieldBreakpoint;
    }(Blockly.FieldNumber));
    pxtblockly.FieldBreakpoint = FieldBreakpoint;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldColorWheel = /** @class */ (function (_super) {
        __extends(FieldColorWheel, _super);
        /**
         * Class for a color wheel field.
         * @param {number|string} value The initial content of the field.
         * @param {Function=} opt_validator An optional function that is called
         *     to validate any constraints on what the user entered.  Takes the new
         *     text as an argument and returns either the accepted text, a replacement
         *     text, or null to abort the change.
         * @extends {Blockly.FieldNumber}
         * @constructor
         */
        function FieldColorWheel(value_, params, opt_validator) {
            var _this = _super.call(this, String(value_), '0', '255', '1', '10', 'Color', opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.params = params;
            if (_this.params['min'])
                _this.min_ = parseFloat(_this.params['min']);
            if (_this.params['max'])
                _this.max_ = parseFloat(_this.params['max']);
            if (_this.params['label'])
                _this.labelText_ = _this.params['label'];
            if (_this.params['channel'])
                _this.channel_ = _this.params['channel'];
            return _this;
        }
        /**
         * Set the gradient CSS properties for the given node and channel
         * @param {Node} node - The DOM node the gradient will be set on.
         * @private
         */
        FieldColorWheel.prototype.setBackground_ = function (node) {
            var gradient = this.createColourStops_().join(',');
            goog.style.setStyle(node, 'background', '-moz-linear-gradient(left, ' + gradient + ')');
            goog.style.setStyle(node, 'background', '-webkit-linear-gradient(left, ' + gradient + ')');
            goog.style.setStyle(node, 'background', '-o-linear-gradient(left, ' + gradient + ')');
            goog.style.setStyle(node, 'background', '-ms-linear-gradient(left, ' + gradient + ')');
            goog.style.setStyle(node, 'background', 'linear-gradient(left, ' + gradient + ')');
            if (this.params['sliderWidth'])
                goog.style.setStyle(node, 'width', this.params['sliderWidth'] + "px");
        };
        ;
        FieldColorWheel.prototype.setReadout_ = function (readout, value) {
            var hexValue = this.colorWheel(parseInt(value), this.channel_);
            // <span class="blocklyColorReadout" style="background-color: ${hexValue};"></span>
            var readoutSpan = document.createElement('span');
            readoutSpan.className = "blocklyColorReadout";
            readoutSpan.style.backgroundColor = "" + hexValue;
            pxsim.U.clear(readout);
            readout.appendChild(readoutSpan);
        };
        FieldColorWheel.prototype.createColourStops_ = function () {
            var stops = [];
            for (var n = 0; n <= 255; n += 20) {
                stops.push(this.colorWheel(n, this.channel_));
            }
            return stops;
        };
        ;
        FieldColorWheel.prototype.colorWheel = function (wheelPos, channel) {
            if (channel == "hsvfast") {
                return this.hsvFast(wheelPos, 255, 255);
            }
            else {
                wheelPos = 255 - wheelPos;
                if (wheelPos < 85) {
                    return this.hex(wheelPos * 3, 255, 255 - wheelPos * 3);
                }
                if (wheelPos < 170) {
                    wheelPos -= 85;
                    return this.hex(255, 255 - wheelPos * 3, wheelPos * 3);
                }
                wheelPos -= 170;
                return this.hex(255 - wheelPos * 3, wheelPos * 3, 255);
            }
        };
        FieldColorWheel.prototype.hsvFast = function (hue, sat, val) {
            var h = (hue % 255) >> 0;
            if (h < 0)
                h += 255;
            // scale down to 0..192
            h = (h * 192 / 255) >> 0;
            //reference: based on FastLED's hsv2rgb rainbow algorithm [https://github.com/FastLED/FastLED](MIT)
            var invsat = 255 - sat;
            var brightness_floor = ((val * invsat) / 255) >> 0;
            var color_amplitude = val - brightness_floor;
            var section = (h / 0x40) >> 0; // [0..2]
            var offset = (h % 0x40) >> 0; // [0..63]
            var rampup = offset;
            var rampdown = (0x40 - 1) - offset;
            var rampup_amp_adj = ((rampup * color_amplitude) / (255 / 4)) >> 0;
            var rampdown_amp_adj = ((rampdown * color_amplitude) / (255 / 4)) >> 0;
            var rampup_adj_with_floor = (rampup_amp_adj + brightness_floor);
            var rampdown_adj_with_floor = (rampdown_amp_adj + brightness_floor);
            var r;
            var g;
            var b;
            if (section) {
                if (section == 1) {
                    // section 1: 0x40..0x7F
                    r = brightness_floor;
                    g = rampdown_adj_with_floor;
                    b = rampup_adj_with_floor;
                }
                else {
                    // section 2; 0x80..0xBF
                    r = rampup_adj_with_floor;
                    g = brightness_floor;
                    b = rampdown_adj_with_floor;
                }
            }
            else {
                // section 0: 0x00..0x3F
                r = rampdown_adj_with_floor;
                g = rampup_adj_with_floor;
                b = brightness_floor;
            }
            return this.hex(r, g, b);
        };
        FieldColorWheel.prototype.hex = function (red, green, blue) {
            return "#" + this.componentToHex(red & 0xFF) + this.componentToHex(green & 0xFF) + this.componentToHex(blue & 0xFF);
        };
        FieldColorWheel.prototype.componentToHex = function (c) {
            var hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        };
        return FieldColorWheel;
    }(Blockly.FieldSlider));
    pxtblockly.FieldColorWheel = FieldColorWheel;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldColorNumber = /** @class */ (function (_super) {
        __extends(FieldColorNumber, _super);
        function FieldColorNumber(text, params, opt_validator) {
            var _this = _super.call(this, text, opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.valueMode_ = "rgb";
            if (params.colours)
                _this.setColours(JSON.parse(params.colours));
            else if (pxt.appTarget.runtime && pxt.appTarget.runtime.palette) {
                var p = pxt.Util.clone(pxt.appTarget.runtime.palette);
                p[0] = "#dedede";
                var t = void 0;
                if (pxt.appTarget.runtime.paletteNames) {
                    t = pxt.Util.clone(pxt.appTarget.runtime.paletteNames);
                    t[0] = lf("transparent");
                }
                _this.setColours(p, t);
            }
            // Set to first color in palette (for toolbox)
            _this.setValue(_this.getColours_()[0]);
            if (params.columns)
                _this.setColumns(parseInt(params.columns));
            if (params.className)
                _this.className_ = params.className;
            if (params.valueMode)
                _this.valueMode_ = params.valueMode;
            return _this;
        }
        /**
         * @override
         */
        FieldColorNumber.prototype.applyColour = function () {
            var _a, _b, _c, _d, _e, _f;
            if (this.borderRect_) {
                this.borderRect_.style.fill = this.value_;
            }
            else if (this.sourceBlock_) {
                (_c = (_b = (_a = this.sourceBlock_) === null || _a === void 0 ? void 0 : _a.pathObject) === null || _b === void 0 ? void 0 : _b.svgPath) === null || _c === void 0 ? void 0 : _c.setAttribute('fill', this.value_);
                (_f = (_e = (_d = this.sourceBlock_) === null || _d === void 0 ? void 0 : _d.pathObject) === null || _e === void 0 ? void 0 : _e.svgPath) === null || _f === void 0 ? void 0 : _f.setAttribute('stroke', '#fff');
            }
        };
        ;
        FieldColorNumber.prototype.doClassValidation_ = function (colour) {
            return "string" != typeof colour ? null : parseColour(colour, this.getColours_());
        };
        /**
         * Return the current colour.
         * @param {boolean} opt_asHex optional field if the returned value should be a hex
         * @return {string} Current colour in '#rrggbb' format.
         */
        FieldColorNumber.prototype.getValue = function (opt_asHex) {
            if (opt_asHex)
                return this.value_;
            switch (this.valueMode_) {
                case "hex":
                    return "\"" + this.value_ + "\"";
                case "rgb":
                    if (this.value_.indexOf('#') > -1) {
                        return "0x" + this.value_.replace(/^#/, '');
                    }
                    else {
                        return this.value_;
                    }
                case "index":
                    if (!this.value_)
                        return "-1";
                    var allColours = this.getColours_();
                    for (var i = 0; i < allColours.length; i++) {
                        if (this.value_.toUpperCase() === allColours[i].toUpperCase()) {
                            return i + "";
                        }
                    }
            }
            return this.value_;
        };
        /**
         * Set the colour.
         * @param {string} colour The new colour in '#rrggbb' format.
         */
        FieldColorNumber.prototype.doValueUpdate_ = function (colour) {
            this.value_ = parseColour(colour, this.getColours_());
            this.applyColour();
        };
        FieldColorNumber.prototype.showEditor_ = function () {
            _super.prototype.showEditor_.call(this);
            if (this.className_ && this.picker_)
                pxt.BrowserUtils.addClass(this.picker_, this.className_);
        };
        FieldColorNumber.prototype.getColours_ = function () {
            return this.colours_;
        };
        return FieldColorNumber;
    }(Blockly.FieldColour));
    pxtblockly.FieldColorNumber = FieldColorNumber;
    function parseColour(colour, allColours) {
        if (colour) {
            var enumSplit = /Colors\.([a-zA-Z]+)/.exec(colour);
            var hexSplit = /(0x|#)([0-9a-fA-F]+)/.exec(colour);
            if (enumSplit) {
                switch (enumSplit[1].toLocaleLowerCase()) {
                    case "red": return "#FF0000";
                    case "orange": return "#FF7F00";
                    case "yellow": return "#FFFF00";
                    case "green": return "#00FF00";
                    case "blue": return "#0000FF";
                    case "indigo": return "#4B0082";
                    case "violet": return "#8A2BE2";
                    case "purple": return "#A033E5";
                    case "pink": return "#FF007F";
                    case "white": return "#FFFFFF";
                    case "black": return "#000000";
                    default: return colour;
                }
            }
            else if (hexSplit) {
                var hexLiteralNumber = hexSplit[2];
                if (hexLiteralNumber.length === 3) {
                    // if shorthand color, return standard hex triple
                    var output = "#";
                    for (var i = 0; i < hexLiteralNumber.length; i++) {
                        var digit = hexLiteralNumber.charAt(i);
                        output += digit + digit;
                    }
                    return output;
                }
                else if (hexLiteralNumber.length === 6) {
                    return "#" + hexLiteralNumber;
                }
            }
            if (allColours) {
                var parsedAsInt = parseInt(colour);
                // Might be the index and not the color
                if (!isNaN(parsedAsInt) && allColours[parsedAsInt] != undefined) {
                    return allColours[parsedAsInt];
                }
                else {
                    return allColours[0];
                }
            }
        }
        return colour;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldGridPicker = /** @class */ (function (_super) {
        __extends(FieldGridPicker, _super);
        function FieldGridPicker(text, options, validator) {
            var _this = _super.call(this, options.data) || this;
            _this.isFieldCustom_ = true;
            /**
             * Callback for when a button is clicked inside the drop-down.
             * Should be bound to the FieldIconMenu.
             * @param {Event} e DOM event for the click/touch
             * @private
             */
            _this.buttonClick_ = function (e) {
                var value = e.target.getAttribute('data-value');
                if (value !== null) {
                    this.setValue(value);
                    // Close the picker
                    if (this.closeModal_) {
                        this.close();
                        this.closeModal_ = false;
                    }
                }
            };
            _this.buttonClickAndClose_ = function (e) {
                this.closeModal_ = true;
                this.buttonClick_(e);
            };
            _this.columns_ = parseInt(options.columns) || 4;
            _this.maxRows_ = parseInt(options.maxRows) || 0;
            _this.width_ = parseInt(options.width) || 200;
            _this.backgroundColour_ = pxtblockly.parseColour(options.colour);
            _this.borderColour_ = pxt.toolbox.fadeColor(_this.backgroundColour_, 0.4, false);
            var tooltipCfg = {
                xOffset: parseInt(options.tooltipsXOffset) || 15,
                yOffset: parseInt(options.tooltipsYOffset) || -10
            };
            _this.tooltipConfig_ = tooltipCfg;
            _this.hasSearchBar_ = !!options.hasSearchBar || false;
            _this.hideRect_ = !!options.hideRect || false;
            return _this;
        }
        /**
         * When disposing the grid picker, make sure the tooltips are disposed too.
         * @public
         */
        FieldGridPicker.prototype.dispose = function () {
            _super.prototype.dispose.call(this);
            this.disposeTooltip();
            this.disposeIntersectionObserver();
        };
        FieldGridPicker.prototype.createTooltip_ = function () {
            if (this.gridTooltip_)
                return;
            // Create tooltip
            this.gridTooltip_ = document.createElement('div');
            this.gridTooltip_.className = 'goog-tooltip blocklyGridPickerTooltip';
            this.gridTooltip_.style.position = 'absolute';
            this.gridTooltip_.style.display = 'none';
            this.gridTooltip_.style.visibility = 'hidden';
            document.body.appendChild(this.gridTooltip_);
        };
        /**
         * Create blocklyGridPickerRows and add them to table container
         * @param options
         * @param tableContainer
         */
        FieldGridPicker.prototype.populateTableContainer = function (options, tableContainer, scrollContainer) {
            pxsim.U.removeChildren(tableContainer);
            if (options.length == 0) {
                this.firstItem_ = undefined;
            }
            for (var i = 0; i < options.length / this.columns_; i++) {
                var row = this.populateRow(i, options, tableContainer);
                tableContainer.appendChild(row);
            }
        };
        /**
         * Populate a single row and add it to table container
         * @param row
         * @param options
         * @param tableContainer
         */
        FieldGridPicker.prototype.populateRow = function (row, options, tableContainer) {
            var _this = this;
            var columns = this.columns_;
            var rowContent = document.createElement('div');
            rowContent.className = 'blocklyGridPickerRow';
            var _loop_3 = function (i) {
                var content = options[i][0]; // Human-readable text or image.
                var value = options[i][1]; // Language-neutral value.
                var menuItem = document.createElement('div');
                menuItem.className = 'goog-menuitem goog-option';
                menuItem.setAttribute('id', ':' + i); // For aria-activedescendant
                menuItem.setAttribute('role', 'menuitem');
                menuItem.style.userSelect = 'none';
                menuItem.title = content['alt'] || content;
                menuItem.setAttribute('data-value', value);
                var menuItemContent = document.createElement('div');
                menuItemContent.setAttribute('class', 'goog-menuitem-content');
                menuItemContent.title = content['alt'] || content;
                menuItemContent.setAttribute('data-value', value);
                var hasImages = typeof content == 'object';
                // Set colour
                var backgroundColour = this_2.backgroundColour_;
                if (value == this_2.getValue()) {
                    // This option is selected
                    menuItem.setAttribute('aria-selected', 'true');
                    pxt.BrowserUtils.addClass(menuItem, 'goog-option-selected');
                    backgroundColour = this_2.sourceBlock_.getColourTertiary();
                    // Save so we can scroll to it later
                    this_2.selectedItemDom = menuItem;
                    if (hasImages && !this_2.shouldShowTooltips()) {
                        this_2.updateSelectedBar_(content, value);
                    }
                }
                menuItem.style.backgroundColor = backgroundColour;
                menuItem.style.borderColor = this_2.borderColour_;
                if (hasImages) {
                    // An image, not text.
                    var buttonImg = new Image(content['width'], content['height']);
                    buttonImg.setAttribute('draggable', 'false');
                    if (!('IntersectionObserver' in window)) {
                        // No intersection observer support, set the image url immediately
                        buttonImg.src = content['src'];
                    }
                    else {
                        buttonImg.src = FieldGridPicker.DEFAULT_IMG;
                        buttonImg.setAttribute('data-src', content['src']);
                        this_2.observer.observe(buttonImg);
                    }
                    buttonImg.alt = content['alt'] || '';
                    buttonImg.setAttribute('data-value', value);
                    menuItemContent.appendChild(buttonImg);
                }
                else {
                    // text
                    menuItemContent.textContent = content;
                }
                if (this_2.shouldShowTooltips()) {
                    Blockly.bindEvent_(menuItem, 'click', this_2, this_2.buttonClickAndClose_);
                    // Setup hover tooltips
                    var xOffset_1 = (this_2.sourceBlock_.RTL ? -this_2.tooltipConfig_.xOffset : this_2.tooltipConfig_.xOffset);
                    var yOffset_1 = this_2.tooltipConfig_.yOffset;
                    Blockly.bindEvent_(menuItem, 'mousemove', this_2, function (e) {
                        if (hasImages) {
                            _this.gridTooltip_.style.top = e.clientY + yOffset_1 + "px";
                            _this.gridTooltip_.style.left = e.clientX + xOffset_1 + "px";
                            // Set tooltip text
                            var touchTarget = document.elementFromPoint(e.clientX, e.clientY);
                            var title = touchTarget.title || touchTarget.alt;
                            _this.gridTooltip_.textContent = title;
                            // Show the tooltip
                            _this.gridTooltip_.style.visibility = title ? 'visible' : 'hidden';
                            _this.gridTooltip_.style.display = title ? '' : 'none';
                        }
                        pxt.BrowserUtils.addClass(menuItem, 'goog-menuitem-highlight');
                        tableContainer.setAttribute('aria-activedescendant', menuItem.id);
                    });
                    Blockly.bindEvent_(menuItem, 'mouseout', this_2, function (e) {
                        if (hasImages) {
                            // Hide the tooltip
                            _this.gridTooltip_.style.visibility = 'hidden';
                            _this.gridTooltip_.style.display = 'none';
                        }
                        pxt.BrowserUtils.removeClass(menuItem, 'goog-menuitem-highlight');
                        tableContainer.removeAttribute('aria-activedescendant');
                    });
                }
                else {
                    if (hasImages) {
                        // Show the selected bar
                        this_2.selectedBar_.style.display = '';
                        // Show the selected item (in the selected bar)
                        Blockly.bindEvent_(menuItem, 'click', this_2, function (e) {
                            if (_this.closeModal_) {
                                _this.buttonClick_(e);
                            }
                            else {
                                // Clear all current hovers.
                                var currentHovers = tableContainer.getElementsByClassName('goog-menuitem-highlight');
                                for (var i_3 = 0; i_3 < currentHovers.length; i_3++) {
                                    pxt.BrowserUtils.removeClass(currentHovers[i_3], 'goog-menuitem-highlight');
                                }
                                // Set hover on current item
                                pxt.BrowserUtils.addClass(menuItem, 'goog-menuitem-highlight');
                                _this.updateSelectedBar_(content, value);
                            }
                        });
                    }
                    else {
                        Blockly.bindEvent_(menuItem, 'click', this_2, this_2.buttonClickAndClose_);
                        Blockly.bindEvent_(menuItem, 'mouseup', this_2, this_2.buttonClickAndClose_);
                    }
                }
                menuItem.appendChild(menuItemContent);
                rowContent.appendChild(menuItem);
                if (i == 0) {
                    this_2.firstItem_ = menuItem;
                }
            };
            var this_2 = this;
            for (var i = (columns * row); i < Math.min((columns * row) + columns, options.length); i++) {
                _loop_3(i);
            }
            return rowContent;
        };
        /**
         * Whether or not to show a box around the dropdown menu.
         * @return {boolean} True if we should show a box (rect) around the dropdown menu. Otherwise false.
         * @private
         */
        FieldGridPicker.prototype.shouldShowRect_ = function () {
            return !this.hideRect_ ? !this.sourceBlock_.isShadow() : false;
        };
        FieldGridPicker.prototype.doClassValidation_ = function (newValue) {
            return newValue;
        };
        /**
         * Closes the gridpicker.
         */
        FieldGridPicker.prototype.close = function () {
            this.disposeTooltip();
            Blockly.WidgetDiv.hideIfOwner(this);
            Blockly.Events.setGroup(false);
        };
        /**
         * Getter method
         */
        FieldGridPicker.prototype.getFirstItem = function () {
            return this.firstItem_;
        };
        /**
         * Highlight first item in menu, de-select and de-highlight all others
         */
        FieldGridPicker.prototype.highlightFirstItem = function (tableContainerDom) {
            var menuItemsDom = tableContainerDom.childNodes;
            if (menuItemsDom.length && menuItemsDom[0].childNodes) {
                for (var row = 0; row < menuItemsDom.length; ++row) {
                    var rowLength = menuItemsDom[row].childNodes.length;
                    for (var col = 0; col < rowLength; ++col) {
                        var menuItem = menuItemsDom[row].childNodes[col];
                        pxt.BrowserUtils.removeClass(menuItem, "goog-menuitem-highlight");
                        pxt.BrowserUtils.removeClass(menuItem, "goog-option-selected");
                    }
                }
                var firstItem = menuItemsDom[0].childNodes[0];
                firstItem.className += " goog-menuitem-highlight";
            }
        };
        /**
         * Scroll menu to item that equals current value of gridpicker
         */
        FieldGridPicker.prototype.highlightAndScrollSelected = function (tableContainerDom, scrollContainerDom) {
            if (!this.selectedItemDom)
                return;
            goog.style.scrollIntoContainerView(this.selectedItemDom, scrollContainerDom, true);
        };
        /**
         * Create a dropdown menu under the text.
         * @private
         */
        FieldGridPicker.prototype.showEditor_ = function () {
            var _this = this;
            Blockly.WidgetDiv.show(this, this.sourceBlock_.RTL, function () {
                _this.onClose_();
            });
            this.setupIntersectionObserver_();
            this.createTooltip_();
            var tableContainer = document.createElement("div");
            this.positionMenu_(tableContainer);
        };
        FieldGridPicker.prototype.positionMenu_ = function (tableContainer) {
            // Record viewport dimensions before adding the dropdown.
            var viewportBBox = Blockly.utils.getViewportBBox();
            var anchorBBox = this.getAnchorDimensions_();
            var _a = this.createWidget_(tableContainer), paddingContainer = _a.paddingContainer, scrollContainer = _a.scrollContainer;
            var containerSize = {
                width: paddingContainer.offsetWidth,
                height: paddingContainer.offsetHeight
            }; //goog.style.getSize(paddingContainer);
            // Set width
            var windowSize = goog.dom.getViewportSize();
            if (this.width_ > windowSize.width) {
                this.width_ = windowSize.width;
            }
            tableContainer.style.width = this.width_ + 'px';
            var addedHeight = 0;
            if (this.hasSearchBar_)
                addedHeight += 50; // Account for search bar
            if (this.selectedBar_)
                addedHeight += 50; // Account for the selected bar
            // Set height
            if (this.maxRows_) {
                // Calculate height
                var firstRowDom = tableContainer.children[0];
                var rowHeight = firstRowDom.offsetHeight;
                // Compute maxHeight using maxRows + 0.3 to partially show next row, to hint at scrolling
                var maxHeight = rowHeight * (this.maxRows_ + 0.3);
                if (windowSize.height < (maxHeight + addedHeight)) {
                    maxHeight = windowSize.height - addedHeight;
                }
                if (containerSize.height > maxHeight) {
                    scrollContainer.style.overflowY = "auto";
                    goog.style.setHeight(scrollContainer, maxHeight);
                    containerSize.height = maxHeight;
                }
            }
            containerSize.height += addedHeight;
            if (this.sourceBlock_.RTL) {
                Blockly.utils.uiMenu.adjustBBoxesForRTL(viewportBBox, anchorBBox, containerSize);
            }
            // Position the menu.
            Blockly.WidgetDiv.positionWithAnchor(viewportBBox, anchorBBox, containerSize, this.sourceBlock_.RTL);
            //            (<any>scrollContainer).focus();
            this.highlightAndScrollSelected(tableContainer, scrollContainer);
        };
        ;
        FieldGridPicker.prototype.shouldShowTooltips = function () {
            return !pxt.BrowserUtils.isMobile();
        };
        FieldGridPicker.prototype.getAnchorDimensions_ = function () {
            var boundingBox = this.getScaledBBox();
            if (this.sourceBlock_.RTL) {
                boundingBox.right += Blockly.FieldDropdown.CHECKMARK_OVERHANG;
            }
            else {
                boundingBox.left -= Blockly.FieldDropdown.CHECKMARK_OVERHANG;
            }
            return boundingBox;
        };
        ;
        FieldGridPicker.prototype.createWidget_ = function (tableContainer) {
            var div = Blockly.WidgetDiv.DIV;
            var options = this.getOptions();
            // Container for the menu rows
            tableContainer.setAttribute("role", "menu");
            tableContainer.setAttribute("aria-haspopup", "true");
            // Container used to limit the height of the tableContainer, because the tableContainer uses
            // display: table, which ignores height and maxHeight
            var scrollContainer = document.createElement("div");
            // Needed to correctly style borders and padding around the scrollContainer, because the padding around the
            // scrollContainer is part of the scrollable area and will not be correctly shown at the top and bottom
            // when scrolling
            var paddingContainer = document.createElement("div");
            paddingContainer.style.border = "solid 1px " + this.borderColour_;
            tableContainer.style.backgroundColor = this.backgroundColour_;
            scrollContainer.style.backgroundColor = this.backgroundColour_;
            paddingContainer.style.backgroundColor = this.backgroundColour_;
            tableContainer.className = 'blocklyGridPickerMenu';
            scrollContainer.className = 'blocklyGridPickerScroller';
            paddingContainer.className = 'blocklyGridPickerPadder';
            paddingContainer.appendChild(scrollContainer);
            scrollContainer.appendChild(tableContainer);
            div.appendChild(paddingContainer);
            // Search bar
            if (this.hasSearchBar_) {
                var searchBar = this.createSearchBar_(tableContainer, scrollContainer, options);
                paddingContainer.insertBefore(searchBar, paddingContainer.childNodes[0]);
            }
            // Selected bar
            if (!this.shouldShowTooltips()) {
                this.selectedBar_ = this.createSelectedBar_();
                paddingContainer.appendChild(this.selectedBar_);
            }
            // Render elements
            this.populateTableContainer(options, tableContainer, scrollContainer);
            return { paddingContainer: paddingContainer, scrollContainer: scrollContainer };
        };
        FieldGridPicker.prototype.createSearchBar_ = function (tableContainer, scrollContainer, options) {
            var _this = this;
            var searchBarDiv = document.createElement("div");
            searchBarDiv.setAttribute("class", "ui fluid icon input");
            var searchIcon = document.createElement("i");
            searchIcon.setAttribute("class", "search icon");
            var searchBar = document.createElement("input");
            searchBar.setAttribute("type", "search");
            searchBar.setAttribute("id", "search-bar");
            searchBar.setAttribute("class", "blocklyGridPickerSearchBar");
            searchBar.setAttribute("placeholder", pxt.Util.lf("Search"));
            searchBar.addEventListener("click", function () {
                searchBar.focus();
                searchBar.setSelectionRange(0, searchBar.value.length);
            });
            // Search on key change
            searchBar.addEventListener("keyup", pxt.Util.debounce(function () {
                var text = searchBar.value;
                var re = new RegExp(text, "i");
                var filteredOptions = options.filter(function (block) {
                    var alt = block[0].alt; // Human-readable text or image.
                    var value = block[1]; // Language-neutral value.
                    return alt ? re.test(alt) : re.test(value);
                });
                _this.populateTableContainer.bind(_this)(filteredOptions, tableContainer, scrollContainer);
                if (text) {
                    _this.highlightFirstItem(tableContainer);
                }
                else {
                    _this.highlightAndScrollSelected(tableContainer, scrollContainer);
                }
                // Hide the tooltip
                _this.gridTooltip_.style.visibility = 'hidden';
                _this.gridTooltip_.style.display = 'none';
            }, 300, false));
            // Select the first item if the enter key is pressed
            searchBar.addEventListener("keyup", function (e) {
                var code = e.which;
                if (code == 13) { /* Enter key */
                    // Select the first item in the list
                    var firstRow = tableContainer.childNodes[0];
                    if (firstRow) {
                        var firstItem = firstRow.childNodes[0];
                        if (firstItem) {
                            _this.closeModal_ = true;
                            firstItem.click();
                        }
                    }
                }
            });
            searchBarDiv.appendChild(searchBar);
            searchBarDiv.appendChild(searchIcon);
            return searchBarDiv;
        };
        FieldGridPicker.prototype.createSelectedBar_ = function () {
            var _this = this;
            var selectedBar = document.createElement("div");
            selectedBar.setAttribute("class", "blocklyGridPickerSelectedBar");
            selectedBar.style.display = 'none';
            var selectedWrapper = document.createElement("div");
            var selectedImgWrapper = document.createElement("div");
            selectedImgWrapper.className = 'blocklyGridPickerSelectedImage';
            selectedWrapper.appendChild(selectedImgWrapper);
            this.selectedImg_ = document.createElement("img");
            this.selectedImg_.setAttribute('width', '30px');
            this.selectedImg_.setAttribute('height', '30px');
            this.selectedImg_.setAttribute('draggable', 'false');
            this.selectedImg_.style.display = 'none';
            this.selectedImg_.src = FieldGridPicker.DEFAULT_IMG;
            selectedImgWrapper.appendChild(this.selectedImg_);
            this.selectedBarText_ = document.createElement("span");
            this.selectedBarText_.className = 'blocklyGridPickerTooltip';
            selectedWrapper.appendChild(this.selectedBarText_);
            var buttonsWrapper = document.createElement("div");
            var buttonsDiv = document.createElement("div");
            buttonsDiv.className = 'ui buttons mini';
            buttonsWrapper.appendChild(buttonsDiv);
            var selectButton = document.createElement("button");
            selectButton.className = "ui button icon green";
            var selectButtonIcon = document.createElement("i");
            selectButtonIcon.className = 'icon check';
            selectButton.appendChild(selectButtonIcon);
            Blockly.bindEvent_(selectButton, 'click', this, function () {
                _this.setValue(_this.selectedBarValue_);
                _this.close();
            });
            var cancelButton = document.createElement("button");
            cancelButton.className = "ui button icon red";
            var cancelButtonIcon = document.createElement("i");
            cancelButtonIcon.className = 'icon cancel';
            cancelButton.appendChild(cancelButtonIcon);
            Blockly.bindEvent_(cancelButton, 'click', this, function () {
                _this.close();
            });
            buttonsDiv.appendChild(selectButton);
            buttonsDiv.appendChild(cancelButton);
            selectedBar.appendChild(selectedWrapper);
            selectedBar.appendChild(buttonsWrapper);
            return selectedBar;
        };
        FieldGridPicker.prototype.updateSelectedBar_ = function (content, value) {
            if (content['src']) {
                this.selectedImg_.src = content['src'];
                this.selectedImg_.style.display = '';
            }
            this.selectedImg_.alt = content['alt'] || content;
            this.selectedBarText_.textContent = content['alt'] || content;
            this.selectedBarValue_ = value;
        };
        FieldGridPicker.prototype.setupIntersectionObserver_ = function () {
            var _this = this;
            if (!('IntersectionObserver' in window))
                return;
            this.disposeIntersectionObserver();
            // setup intersection observer for the image
            var preloadImage = function (el) {
                var lazyImageUrl = el.getAttribute('data-src');
                if (lazyImageUrl) {
                    el.src = lazyImageUrl;
                    el.removeAttribute('data-src');
                }
            };
            var config = {
                // If the image gets within 50px in the Y axis, start the download.
                rootMargin: '20px 0px',
                threshold: 0.01
            };
            var onIntersection = function (entries) {
                entries.forEach(function (entry) {
                    // Are we in viewport?
                    if (entry.intersectionRatio > 0) {
                        // Stop watching and load the image
                        _this.observer.unobserve(entry.target);
                        preloadImage(entry.target);
                    }
                });
            };
            this.observer = new IntersectionObserver(onIntersection, config);
        };
        FieldGridPicker.prototype.disposeIntersectionObserver = function () {
            if (this.observer) {
                this.observer = null;
            }
        };
        /**
         * Disposes the tooltip DOM.
         * @private
         */
        FieldGridPicker.prototype.disposeTooltip = function () {
            if (this.gridTooltip_) {
                pxsim.U.remove(this.gridTooltip_);
                this.gridTooltip_ = null;
            }
        };
        FieldGridPicker.prototype.onClose_ = function () {
            this.disposeTooltip();
        };
        FieldGridPicker.DEFAULT_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        return FieldGridPicker;
    }(Blockly.FieldDropdown));
    pxtblockly.FieldGridPicker = FieldGridPicker;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldImageDropdown = /** @class */ (function (_super) {
        __extends(FieldImageDropdown, _super);
        function FieldImageDropdown(text, options, validator) {
            var _this = _super.call(this, options.data) || this;
            _this.isFieldCustom_ = true;
            /**
             * Callback for when a button is clicked inside the drop-down.
             * Should be bound to the FieldIconMenu.
             * @param {Event} e DOM event for the click/touch
             * @private
             */
            _this.buttonClick_ = function (e) {
                var value = e.target.getAttribute('data-value');
                if (!value)
                    return;
                this.setValue(value);
                Blockly.DropDownDiv.hide();
            };
            _this.columns_ = parseInt(options.columns);
            _this.maxRows_ = parseInt(options.maxRows) || 0;
            _this.width_ = parseInt(options.width) || 300;
            _this.backgroundColour_ = pxtblockly.parseColour(options.colour);
            _this.borderColour_ = pxt.toolbox.fadeColor(_this.backgroundColour_, 0.4, false);
            return _this;
        }
        /**
         * Create a dropdown menu under the text.
         * @private
         */
        FieldImageDropdown.prototype.showEditor_ = function () {
            var _a, _b;
            // If there is an existing drop-down we own, this is a request to hide the drop-down.
            if (Blockly.DropDownDiv.hideIfOwner(this)) {
                return;
            }
            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            // Populate the drop-down with the icons for this field.
            var dropdownDiv = Blockly.DropDownDiv.getContentDiv();
            var contentDiv = document.createElement('div');
            // Accessibility properties
            contentDiv.setAttribute('role', 'menu');
            contentDiv.setAttribute('aria-haspopup', 'true');
            var options = this.getOptions();
            var maxButtonHeight = 0;
            for (var i = 0; i < options.length; i++) {
                var content = options[i][0]; // Human-readable text or image.
                var value = options[i][1]; // Language-neutral value.
                // Icons with the type property placeholder take up space but don't have any functionality
                // Use for special-case layouts
                if (content.type == 'placeholder') {
                    var placeholder = document.createElement('span');
                    placeholder.setAttribute('class', 'blocklyDropDownPlaceholder');
                    placeholder.style.width = content.width + 'px';
                    placeholder.style.height = content.height + 'px';
                    contentDiv.appendChild(placeholder);
                    continue;
                }
                var button = document.createElement('button');
                button.setAttribute('id', ':' + i); // For aria-activedescendant
                button.setAttribute('role', 'menuitem');
                button.setAttribute('class', 'blocklyDropDownButton');
                button.title = content.alt;
                var buttonSize = content.height;
                if (this.columns_) {
                    buttonSize = ((this.width_ / this.columns_) - 8);
                    button.style.width = buttonSize + 'px';
                    button.style.height = buttonSize + 'px';
                }
                else {
                    button.style.width = content.width + 'px';
                    button.style.height = content.height + 'px';
                }
                if (buttonSize > maxButtonHeight) {
                    maxButtonHeight = buttonSize;
                }
                var backgroundColor = this.backgroundColour_;
                if (value == this.getValue()) {
                    // This icon is selected, show it in a different colour
                    backgroundColor = this.sourceBlock_.getColourTertiary();
                    button.setAttribute('aria-selected', 'true');
                }
                button.style.backgroundColor = backgroundColor;
                button.style.borderColor = this.borderColour_;
                Blockly.bindEvent_(button, 'click', this, this.buttonClick_);
                Blockly.bindEvent_(button, 'mouseover', button, function () {
                    this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                    contentDiv.setAttribute('aria-activedescendant', this.id);
                });
                Blockly.bindEvent_(button, 'mouseout', button, function () {
                    this.setAttribute('class', 'blocklyDropDownButton');
                    contentDiv.removeAttribute('aria-activedescendant');
                });
                var buttonImg = document.createElement('img');
                buttonImg.src = content.src;
                //buttonImg.alt = icon.alt;
                // Upon click/touch, we will be able to get the clicked element as e.target
                // Store a data attribute on all possible click targets so we can match it to the icon.
                button.setAttribute('data-value', value);
                buttonImg.setAttribute('data-value', value);
                button.appendChild(buttonImg);
                contentDiv.appendChild(button);
            }
            contentDiv.style.width = this.width_ + 'px';
            dropdownDiv.appendChild(contentDiv);
            if (this.maxRows_) {
                // Limit the number of rows shown, but add a partial next row to indicate scrolling
                dropdownDiv.style.maxHeight = (this.maxRows_ + 0.4) * (maxButtonHeight + 8) + 'px';
            }
            if (pxt.BrowserUtils.isFirefox()) {
                // This is to compensate for the scrollbar that overlays content in Firefox. It
                // gets removed in onHide_()
                dropdownDiv.style.paddingRight = "20px";
            }
            Blockly.DropDownDiv.setColour(this.backgroundColour_, this.borderColour_);
            Blockly.DropDownDiv.showPositionedByField(this, this.onHide_.bind(this));
            var source = this.sourceBlock_;
            this.savedPrimary_ = (_a = source) === null || _a === void 0 ? void 0 : _a.getColour();
            if ((_b = source) === null || _b === void 0 ? void 0 : _b.isShadow()) {
                source.setColour(source.getColourTertiary());
            }
            else if (this.borderRect_) {
                this.borderRect_.setAttribute('fill', source.getColourTertiary());
            }
        };
        /**
         * Callback for when the drop-down is hidden.
         */
        FieldImageDropdown.prototype.onHide_ = function () {
            var _a;
            var content = Blockly.DropDownDiv.getContentDiv();
            content.removeAttribute('role');
            content.removeAttribute('aria-haspopup');
            content.removeAttribute('aria-activedescendant');
            content.style.width = '';
            content.style.paddingRight = '';
            content.style.maxHeight = '';
            var source = this.sourceBlock_;
            if ((_a = source) === null || _a === void 0 ? void 0 : _a.isShadow()) {
                this.sourceBlock_.setColour(this.savedPrimary_);
            }
            else if (this.borderRect_) {
                this.borderRect_.setAttribute('fill', this.savedPrimary_);
            }
        };
        ;
        return FieldImageDropdown;
    }(Blockly.FieldDropdown));
    pxtblockly.FieldImageDropdown = FieldImageDropdown;
})(pxtblockly || (pxtblockly = {}));
var pxtblockly;
(function (pxtblockly) {
    var FieldImages = /** @class */ (function (_super) {
        __extends(FieldImages, _super);
        function FieldImages(text, options, validator) {
            var _this = _super.call(this, text, options, validator) || this;
            _this.isFieldCustom_ = true;
            _this.shouldSort_ = options.sort;
            _this.addLabel_ = !!options.addLabel;
            return _this;
        }
        /**
         * Create a dropdown menu under the text.
         * @private
         */
        FieldImages.prototype.showEditor_ = function () {
            var _a, _b;
            // If there is an existing drop-down we own, this is a request to hide the drop-down.
            if (Blockly.DropDownDiv.hideIfOwner(this)) {
                return;
            }
            var sourceBlock = this.sourceBlock_;
            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            // Populate the drop-down with the icons for this field.
            var dropdownDiv = Blockly.DropDownDiv.getContentDiv();
            var contentDiv = document.createElement('div');
            // Accessibility properties
            contentDiv.setAttribute('role', 'menu');
            contentDiv.setAttribute('aria-haspopup', 'true');
            var options = this.getOptions();
            if (this.shouldSort_)
                options.sort();
            for (var i = 0; i < options.length; i++) {
                var content = options[i][0]; // Human-readable text or image.
                var value = options[i][1]; // Language-neutral value.
                // Icons with the type property placeholder take up space but don't have any functionality
                // Use for special-case layouts
                if (content.type == 'placeholder') {
                    var placeholder = document.createElement('span');
                    placeholder.setAttribute('class', 'blocklyDropDownPlaceholder');
                    placeholder.style.width = content.width + 'px';
                    placeholder.style.height = content.height + 'px';
                    contentDiv.appendChild(placeholder);
                    continue;
                }
                var button = document.createElement('button');
                button.setAttribute('id', ':' + i); // For aria-activedescendant
                button.setAttribute('role', 'menuitem');
                button.setAttribute('class', 'blocklyDropDownButton');
                button.title = content.alt;
                if (this.columns_) {
                    button.style.width = ((this.width_ / this.columns_) - 8) + 'px';
                    //button.style.height = ((this.width_ / this.columns_) - 8) + 'px';
                }
                else {
                    button.style.width = content.width + 'px';
                    button.style.height = content.height + 'px';
                }
                var backgroundColor = sourceBlock.getColour();
                if (value == this.getValue()) {
                    // This icon is selected, show it in a different colour
                    backgroundColor = sourceBlock.getColourTertiary();
                    button.setAttribute('aria-selected', 'true');
                }
                button.style.backgroundColor = backgroundColor;
                button.style.borderColor = sourceBlock.getColourTertiary();
                Blockly.bindEvent_(button, 'click', this, this.buttonClick_);
                Blockly.bindEvent_(button, 'mouseover', button, function () {
                    this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                    contentDiv.setAttribute('aria-activedescendant', this.id);
                });
                Blockly.bindEvent_(button, 'mouseout', button, function () {
                    this.setAttribute('class', 'blocklyDropDownButton');
                    contentDiv.removeAttribute('aria-activedescendant');
                });
                var buttonImg = document.createElement('img');
                buttonImg.src = content.src;
                //buttonImg.alt = icon.alt;
                // Upon click/touch, we will be able to get the clicked element as e.target
                // Store a data attribute on all possible click targets so we can match it to the icon.
                button.setAttribute('data-value', value);
                buttonImg.setAttribute('data-value', value);
                button.appendChild(buttonImg);
                if (this.addLabel_) {
                    var buttonText = this.createTextNode_(content.alt);
                    buttonText.setAttribute('data-value', value);
                    button.appendChild(buttonText);
                }
                contentDiv.appendChild(button);
            }
            contentDiv.style.width = this.width_ + 'px';
            dropdownDiv.appendChild(contentDiv);
            Blockly.DropDownDiv.setColour(sourceBlock.getColour(), sourceBlock.getColourTertiary());
            // Position based on the field position.
            Blockly.DropDownDiv.showPositionedByField(this, this.onHideCallback.bind(this));
            // Update colour to look selected.
            this.savedPrimary_ = (_a = sourceBlock) === null || _a === void 0 ? void 0 : _a.getColour();
            if ((_b = sourceBlock) === null || _b === void 0 ? void 0 : _b.isShadow()) {
                sourceBlock.setColour(sourceBlock.style.colourTertiary);
            }
            else if (this.borderRect_) {
                this.borderRect_.setAttribute('fill', sourceBlock.style.colourTertiary);
            }
        };
        // Update color (deselect) on dropdown hide
        FieldImages.prototype.onHideCallback = function () {
            var _a;
            var source = this.sourceBlock_;
            if ((_a = source) === null || _a === void 0 ? void 0 : _a.isShadow()) {
                source.setColour(this.savedPrimary_);
            }
            else if (this.borderRect_) {
                this.borderRect_.setAttribute('fill', this.savedPrimary_);
            }
        };
        FieldImages.prototype.createTextNode_ = function (text) {
            var textSpan = document.createElement('span');
            textSpan.setAttribute('class', 'blocklyDropdownTextLabel');
            textSpan.textContent = text;
            return textSpan;
        };
        return FieldImages;
    }(pxtblockly.FieldImageDropdown));
    pxtblockly.FieldImages = FieldImages;
})(pxtblockly || (pxtblockly = {}));
var pxtblockly;
(function (pxtblockly) {
    var FieldKind = /** @class */ (function (_super) {
        __extends(FieldKind, _super);
        function FieldKind(opts) {
            var _this = _super.call(this, createMenuGenerator(opts)) || this;
            _this.opts = opts;
            return _this;
        }
        FieldKind.prototype.initView = function () {
            _super.prototype.initView.call(this);
            this.initVariables();
        };
        FieldKind.prototype.onItemSelected_ = function (menu, menuItem) {
            var _this = this;
            var value = menuItem.getValue();
            if (value === "CREATE") {
                promptAndCreateKind(this.sourceBlock_.workspace, this.opts, lf("New {0}:", this.opts.memberName), function (newName) { return newName && _this.setValue(newName); });
            }
            else {
                _super.prototype.onItemSelected_.call(this, menu, menuItem);
            }
        };
        FieldKind.prototype.doClassValidation_ = function (value) {
            var _a;
            // update cached option list when adding a new kind
            if (((_a = this.opts) === null || _a === void 0 ? void 0 : _a.initialMembers) && !this.opts.initialMembers.find(function (el) { return el == value; }))
                this.getOptions();
            return _super.prototype.doClassValidation_.call(this, value);
        };
        FieldKind.prototype.initVariables = function () {
            var _this = this;
            if (this.sourceBlock_ && this.sourceBlock_.workspace) {
                var ws_1 = this.sourceBlock_.workspace;
                var existing_1 = getExistingKindMembers(ws_1, this.opts.name);
                this.opts.initialMembers.forEach(function (memberName) {
                    if (existing_1.indexOf(memberName) === -1) {
                        createVariableForKind(ws_1, _this.opts, memberName);
                    }
                });
                if (this.getValue() === "CREATE") {
                    if (this.opts.initialMembers.length) {
                        this.setValue(this.opts.initialMembers[0]);
                    }
                }
            }
        };
        return FieldKind;
    }(Blockly.FieldDropdown));
    pxtblockly.FieldKind = FieldKind;
    function createMenuGenerator(opts) {
        return function () {
            var res = [];
            var that = this;
            if (that.sourceBlock_ && that.sourceBlock_.workspace) {
                var options = that.sourceBlock_.workspace.getVariablesOfType(kindType(opts.name));
                options.forEach(function (model) {
                    res.push([model.name, model.name]);
                });
            }
            else {
                // Can't create variables from within the flyout, so we just have to fake it
                opts.initialMembers.forEach(function (e) { return res.push([e, e]); });
            }
            res.push([lf("Add a new {0}...", opts.memberName), "CREATE"]);
            return res;
        };
    }
    function promptAndCreateKind(ws, opts, message, cb) {
        Blockly.prompt(message, null, function (response) {
            if (response) {
                var nameIsValid = false;
                if (pxtc.isIdentifierStart(response.charCodeAt(0), 2)) {
                    nameIsValid = true;
                    for (var i = 1; i < response.length; i++) {
                        if (!pxtc.isIdentifierPart(response.charCodeAt(i), 2)) {
                            nameIsValid = false;
                        }
                    }
                }
                if (!nameIsValid) {
                    Blockly.alert(lf("Names must start with a letter and can only contain letters, numbers, '$', and '_'."), function () { return promptAndCreateKind(ws, opts, message, cb); });
                    return;
                }
                var existing = getExistingKindMembers(ws, opts.name);
                for (var i = 0; i < existing.length; i++) {
                    var name_10 = existing[i];
                    if (name_10 === response) {
                        Blockly.alert(lf("A {0} named '{1}' already exists.", opts.memberName, response), function () { return promptAndCreateKind(ws, opts, message, cb); });
                        return;
                    }
                }
                if (response === opts.createFunctionName) {
                    Blockly.alert(lf("'{0}' is a reserved name.", opts.createFunctionName), function () { return promptAndCreateKind(ws, opts, message, cb); });
                }
                cb(createVariableForKind(ws, opts, response));
            }
        }, { placeholder: opts.promptHint });
    }
    function getExistingKindMembers(ws, kindName) {
        var existing = ws.getVariablesOfType(kindType(kindName));
        if (existing && existing.length) {
            return existing.map(function (m) { return m.name; });
        }
        else {
            return [];
        }
    }
    function createVariableForKind(ws, opts, newName) {
        Blockly.Variables.getOrCreateVariablePackage(ws, null, newName, kindType(opts.name));
        return newName;
    }
    function kindType(name) {
        return "KIND_" + name;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../built/pxtsim.d.ts"/>
var rowRegex = /^.*[\.#].*$/;
var LabelMode;
(function (LabelMode) {
    LabelMode[LabelMode["None"] = 0] = "None";
    LabelMode[LabelMode["Number"] = 1] = "Number";
    LabelMode[LabelMode["Letter"] = 2] = "Letter";
})(LabelMode || (LabelMode = {}));
var pxtblockly;
(function (pxtblockly) {
    var FieldMatrix = /** @class */ (function (_super) {
        __extends(FieldMatrix, _super);
        function FieldMatrix(text, params, validator) {
            var _this = _super.call(this, text, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.onColor = "#FFFFFF";
            _this.scale = 1;
            // The number of columns
            _this.matrixWidth = 5;
            // The number of rows
            _this.matrixHeight = 5;
            _this.yAxisLabel = LabelMode.None;
            _this.xAxisLabel = LabelMode.None;
            _this.cellState = [];
            _this.cells = [];
            _this.dontHandleMouseEvent_ = function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
            };
            _this.clearLedDragHandler = function (ev) {
                var svgRoot = _this.sourceBlock_.getSvgRoot();
                pxsim.pointerEvents.down.forEach(function (evid) { return svgRoot.removeEventListener(evid, _this.dontHandleMouseEvent_); });
                svgRoot.removeEventListener(pxsim.pointerEvents.move, _this.dontHandleMouseEvent_);
                document.removeEventListener(pxsim.pointerEvents.up, _this.clearLedDragHandler);
                document.removeEventListener(pxsim.pointerEvents.leave, _this.clearLedDragHandler);
                Blockly.Touch.clearTouchIdentifier();
                _this.elt.removeEventListener(pxsim.pointerEvents.move, _this.handleRootMouseMoveListener);
                ev.stopPropagation();
                ev.preventDefault();
            };
            _this.toggleRect = function (x, y) {
                _this.cellState[x][y] = _this.currentDragState_;
                _this.updateValue();
            };
            _this.handleRootMouseMoveListener = function (ev) {
                var clientX;
                var clientY;
                if (ev.changedTouches && ev.changedTouches.length == 1) {
                    // Handle touch events
                    clientX = ev.changedTouches[0].clientX;
                    clientY = ev.changedTouches[0].clientY;
                }
                else {
                    // All other events (pointer + mouse)
                    clientX = ev.clientX;
                    clientY = ev.clientY;
                }
                var target = document.elementFromPoint(clientX, clientY);
                if (!target)
                    return;
                var x = target.getAttribute('data-x');
                var y = target.getAttribute('data-y');
                if (x != null && y != null) {
                    _this.toggleRect(parseInt(x), parseInt(y));
                }
            };
            _this.params = params;
            if (_this.params.rows !== undefined) {
                var val = parseInt(_this.params.rows);
                if (!isNaN(val)) {
                    _this.matrixHeight = val;
                }
            }
            if (_this.params.columns !== undefined) {
                var val = parseInt(_this.params.columns);
                if (!isNaN(val)) {
                    _this.matrixWidth = val;
                }
            }
            if (_this.params.onColor !== undefined) {
                _this.onColor = _this.params.onColor;
            }
            if (_this.params.offColor !== undefined) {
                _this.offColor = _this.params.offColor;
            }
            if (_this.params.scale !== undefined)
                _this.scale = Math.max(0.6, Math.min(2, Number(_this.params.scale)));
            else if (Math.max(_this.matrixWidth, _this.matrixHeight) > 15)
                _this.scale = 0.85;
            else if (Math.max(_this.matrixWidth, _this.matrixHeight) > 10)
                _this.scale = 0.9;
            return _this;
        }
        /**
         * Show the inline free-text editor on top of the text.
         * @private
         */
        FieldMatrix.prototype.showEditor_ = function () {
            // Intentionally left empty
        };
        FieldMatrix.prototype.initMatrix = function () {
            if (!this.sourceBlock_.isInsertionMarker()) {
                this.elt = pxsim.svg.parseString("<svg xmlns=\"http://www.w3.org/2000/svg\" id=\"field-matrix\" />");
                // Initialize the matrix that holds the state
                for (var i = 0; i < this.matrixWidth; i++) {
                    this.cellState.push([]);
                    this.cells.push([]);
                    for (var j = 0; j < this.matrixHeight; j++) {
                        this.cellState[i].push(false);
                    }
                }
                this.restoreStateFromString();
                // Create the cells of the matrix that is displayed
                for (var i = 0; i < this.matrixWidth; i++) {
                    for (var j = 0; j < this.matrixHeight; j++) {
                        this.createCell(i, j);
                    }
                }
                this.updateValue();
                if (this.xAxisLabel !== LabelMode.None) {
                    var y = this.scale * this.matrixHeight * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_VERTICAL_MARGIN) + FieldMatrix.CELL_VERTICAL_MARGIN * 2 + FieldMatrix.BOTTOM_MARGIN;
                    var xAxis = pxsim.svg.child(this.elt, "g", { transform: "translate(" + 0 + " " + y + ")" });
                    for (var i = 0; i < this.matrixWidth; i++) {
                        var x = this.getYAxisWidth() + this.scale * i * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_HORIZONTAL_MARGIN) + FieldMatrix.CELL_WIDTH / 2 + FieldMatrix.CELL_HORIZONTAL_MARGIN / 2;
                        var lbl = pxsim.svg.child(xAxis, "text", { x: x, class: "blocklyText" });
                        lbl.textContent = this.getLabel(i, this.xAxisLabel);
                    }
                }
                if (this.yAxisLabel !== LabelMode.None) {
                    var yAxis = pxsim.svg.child(this.elt, "g", {});
                    for (var i = 0; i < this.matrixHeight; i++) {
                        var y = this.scale * i * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_VERTICAL_MARGIN) + FieldMatrix.CELL_WIDTH / 2 + FieldMatrix.CELL_VERTICAL_MARGIN * 2;
                        var lbl = pxsim.svg.child(yAxis, "text", { x: 0, y: y, class: "blocklyText" });
                        lbl.textContent = this.getLabel(i, this.yAxisLabel);
                    }
                }
                this.fieldGroup_.replaceChild(this.elt, this.fieldGroup_.firstChild);
            }
        };
        FieldMatrix.prototype.getLabel = function (index, mode) {
            switch (mode) {
                case LabelMode.Letter:
                    return String.fromCharCode(index + /*char code for A*/ 65);
                default:
                    return (index + 1).toString();
            }
        };
        FieldMatrix.prototype.createCell = function (x, y) {
            var _this = this;
            var tx = this.scale * x * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_HORIZONTAL_MARGIN) + FieldMatrix.CELL_HORIZONTAL_MARGIN + this.getYAxisWidth();
            var ty = this.scale * y * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_VERTICAL_MARGIN) + FieldMatrix.CELL_VERTICAL_MARGIN;
            var cellG = pxsim.svg.child(this.elt, "g", { transform: "translate(" + tx + " " + ty + ")" });
            var cellRect = pxsim.svg.child(cellG, "rect", {
                'class': "blocklyLed" + (this.cellState[x][y] ? 'On' : 'Off'),
                'cursor': 'pointer',
                width: this.scale * FieldMatrix.CELL_WIDTH, height: this.scale * FieldMatrix.CELL_WIDTH,
                fill: this.getColor(x, y),
                'data-x': x,
                'data-y': y,
                rx: Math.max(2, this.scale * FieldMatrix.CELL_CORNER_RADIUS)
            });
            this.cells[x][y] = cellRect;
            if (this.sourceBlock_.workspace.isFlyout)
                return;
            pxsim.pointerEvents.down.forEach(function (evid) { return cellRect.addEventListener(evid, function (ev) {
                var svgRoot = _this.sourceBlock_.getSvgRoot();
                _this.currentDragState_ = !_this.cellState[x][y];
                // select and hide chaff
                Blockly.hideChaff();
                _this.sourceBlock_.select();
                _this.toggleRect(x, y);
                pxsim.pointerEvents.down.forEach(function (evid) { return svgRoot.addEventListener(evid, _this.dontHandleMouseEvent_); });
                svgRoot.addEventListener(pxsim.pointerEvents.move, _this.dontHandleMouseEvent_);
                document.addEventListener(pxsim.pointerEvents.up, _this.clearLedDragHandler);
                document.addEventListener(pxsim.pointerEvents.leave, _this.clearLedDragHandler);
                // Begin listening on the canvas and toggle any matches
                _this.elt.addEventListener(pxsim.pointerEvents.move, _this.handleRootMouseMoveListener);
                ev.stopPropagation();
                ev.preventDefault();
            }, false); });
        };
        FieldMatrix.prototype.getColor = function (x, y) {
            return this.cellState[x][y] ? this.onColor : (this.offColor || FieldMatrix.DEFAULT_OFF_COLOR);
        };
        FieldMatrix.prototype.getOpacity = function (x, y) {
            return this.cellState[x][y] ? '1.0' : '0.2';
        };
        FieldMatrix.prototype.updateCell = function (x, y) {
            var cellRect = this.cells[x][y];
            cellRect.setAttribute("fill", this.getColor(x, y));
            cellRect.setAttribute("fill-opacity", this.getOpacity(x, y));
            cellRect.setAttribute('class', "blocklyLed" + (this.cellState[x][y] ? 'On' : 'Off'));
        };
        FieldMatrix.prototype.setValue = function (newValue, restoreState) {
            if (restoreState === void 0) { restoreState = true; }
            _super.prototype.setValue.call(this, String(newValue));
            if (this.elt) {
                if (restoreState)
                    this.restoreStateFromString();
                for (var x = 0; x < this.matrixWidth; x++) {
                    for (var y = 0; y < this.matrixHeight; y++) {
                        this.updateCell(x, y);
                    }
                }
            }
        };
        FieldMatrix.prototype.render_ = function () {
            if (!this.visible_) {
                this.size_.width = 0;
                return;
            }
            if (!this.elt) {
                this.initMatrix();
            }
            // The height and width must be set by the render function
            this.size_.height = this.scale * Number(this.matrixHeight) * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_VERTICAL_MARGIN) + FieldMatrix.CELL_VERTICAL_MARGIN * 2 + FieldMatrix.BOTTOM_MARGIN + this.getXAxisHeight();
            this.size_.width = this.scale * Number(this.matrixWidth) * (FieldMatrix.CELL_WIDTH + FieldMatrix.CELL_HORIZONTAL_MARGIN) + this.getYAxisWidth();
        };
        // The return value of this function is inserted in the code
        FieldMatrix.prototype.getValue = function () {
            // getText() returns the value that is set by calls to setValue()
            var text = removeQuotes(this.value_);
            return "`\n" + FieldMatrix.TAB + text + "\n" + FieldMatrix.TAB + "`";
        };
        // Restores the block state from the text value of the field
        FieldMatrix.prototype.restoreStateFromString = function () {
            var r = this.value_;
            if (r) {
                var rows = r.split("\n").filter(function (r) { return rowRegex.test(r); });
                for (var y = 0; y < rows.length && y < this.matrixHeight; y++) {
                    var x = 0;
                    var row = rows[y];
                    for (var j = 0; j < row.length && x < this.matrixWidth; j++) {
                        if (isNegativeCharacter(row[j])) {
                            this.cellState[x][y] = false;
                            x++;
                        }
                        else if (isPositiveCharacter(row[j])) {
                            this.cellState[x][y] = true;
                            x++;
                        }
                    }
                }
            }
        };
        // Composes the state into a string an updates the field's state
        FieldMatrix.prototype.updateValue = function () {
            var res = "";
            for (var y = 0; y < this.matrixHeight; y++) {
                for (var x = 0; x < this.matrixWidth; x++) {
                    res += (this.cellState[x][y] ? "#" : ".") + " ";
                }
                res += "\n" + FieldMatrix.TAB;
            }
            // Blockly stores the state of the field as a string
            this.setValue(res, false);
        };
        FieldMatrix.prototype.getYAxisWidth = function () {
            return this.yAxisLabel === LabelMode.None ? 0 : FieldMatrix.Y_AXIS_WIDTH;
        };
        FieldMatrix.prototype.getXAxisHeight = function () {
            return this.xAxisLabel === LabelMode.None ? 0 : FieldMatrix.X_AXIS_HEIGHT;
        };
        FieldMatrix.CELL_WIDTH = 25;
        FieldMatrix.CELL_HORIZONTAL_MARGIN = 7;
        FieldMatrix.CELL_VERTICAL_MARGIN = 5;
        FieldMatrix.CELL_CORNER_RADIUS = 5;
        FieldMatrix.BOTTOM_MARGIN = 9;
        FieldMatrix.Y_AXIS_WIDTH = 9;
        FieldMatrix.X_AXIS_HEIGHT = 10;
        FieldMatrix.TAB = "        ";
        FieldMatrix.DEFAULT_OFF_COLOR = "#000000";
        return FieldMatrix;
    }(Blockly.Field));
    pxtblockly.FieldMatrix = FieldMatrix;
    function isPositiveCharacter(c) {
        return c === "#" || c === "*" || c === "1";
    }
    function isNegativeCharacter(c) {
        return c === "." || c === "_" || c === "0";
    }
    var allQuotes = ["'", '"', "`"];
    function removeQuotes(str) {
        str = (str || "").trim();
        var start = str.charAt(0);
        if (start === str.charAt(str.length - 1) && allQuotes.indexOf(start) !== -1) {
            return str.substr(1, str.length - 2).trim();
        }
        return str;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../built/pxtlib.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var svg = pxt.svgUtil;
    pxtblockly.HEADER_HEIGHT = 50;
    pxtblockly.TOTAL_WIDTH = 300;
    var FieldCustomMelody = /** @class */ (function (_super) {
        __extends(FieldCustomMelody, _super);
        function FieldCustomMelody(value, params, validator) {
            var _this = _super.call(this, value, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.soundingKeys = 0;
            _this.numRow = 8;
            _this.numCol = 8;
            _this.tempo = 120;
            _this.isPlaying = false;
            _this.timeouts = []; // keep track of timeouts
            _this.params = params;
            _this.createMelodyIfDoesntExist();
            return _this;
        }
        FieldCustomMelody.prototype.init = function () {
            _super.prototype.init.call(this);
            this.onInit();
        };
        FieldCustomMelody.prototype.showEditor_ = function () {
            var _this = this;
            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            Blockly.DropDownDiv.setColour(this.getDropdownBackgroundColour(), this.getDropdownBorderColour());
            var contentDiv = Blockly.DropDownDiv.getContentDiv();
            pxt.BrowserUtils.addClass(contentDiv, "melody-content-div");
            pxt.BrowserUtils.addClass(contentDiv.parentElement, "melody-editor-dropdown");
            this.gallery = new pxtmelody.MelodyGallery();
            this.renderEditor(contentDiv);
            this.prevString = this.getValue();
            // The webapp listens to this event and stops the simulator so that you don't get the melody
            // playing twice (once in the editor and once when the code runs in the sim)
            Blockly.Events.fire(new Blockly.Events.Ui(this.sourceBlock_, "melody-editor", false, true));
            Blockly.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_, function () {
                _this.onEditorClose();
                // revert all style attributes for dropdown div
                pxt.BrowserUtils.removeClass(contentDiv, "melody-content-div");
                pxt.BrowserUtils.removeClass(contentDiv.parentElement, "melody-editor-dropdown");
                Blockly.Events.fire(new Blockly.Events.Ui(_this.sourceBlock_, "melody-editor", true, false));
            });
        };
        FieldCustomMelody.prototype.getValue = function () {
            this.stringRep = this.getTypeScriptValue();
            return this.stringRep;
        };
        FieldCustomMelody.prototype.doValueUpdate_ = function (newValue) {
            if (newValue == null || newValue == "" || newValue == "\"\"" || (this.stringRep && this.stringRep === newValue)) { // ignore empty strings
                return;
            }
            this.stringRep = newValue;
            this.parseTypeScriptValue(newValue);
            _super.prototype.doValueUpdate_.call(this, this.getValue());
        };
        FieldCustomMelody.prototype.getText_ = function () {
            if (this.invalidString)
                return pxt.Util.lf("Invalid Input");
            else
                return this.getValue();
        };
        // This will be run when the field is created (i.e. when it appears on the workspace)
        FieldCustomMelody.prototype.onInit = function () {
            this.render_();
            this.createMelodyIfDoesntExist();
            if (!this.invalidString) {
                if (!this.fieldGroup_) {
                    // Build the DOM.
                    this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
                }
                if (!this.visible_) {
                    this.fieldGroup_.style.display = 'none';
                }
                this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
                this.updateFieldLabel();
            }
        };
        FieldCustomMelody.prototype.render_ = function () {
            _super.prototype.render_.call(this);
            if (!this.invalidString) {
                this.size_.width = FieldCustomMelody.MUSIC_ICON_WIDTH + (FieldCustomMelody.COLOR_BLOCK_WIDTH + FieldCustomMelody.COLOR_BLOCK_SPACING) * this.numCol;
            }
            this.sourceBlock_.setColour("#ffffff");
        };
        // Render the editor that will appear in the dropdown div when the user clicks on the field
        FieldCustomMelody.prototype.renderEditor = function (div) {
            var _this = this;
            var color = this.getDropdownBackgroundColour();
            var secondaryColor = this.getDropdownBorderColour();
            this.topDiv = document.createElement("div");
            pxt.BrowserUtils.addClass(this.topDiv, "melody-top-bar-div");
            // Same toggle set up as sprite editor
            this.root = new svg.SVG(this.topDiv).id("melody-editor-header-controls");
            this.toggle = new Toggle(this.root, { leftText: lf("Editor"), rightText: lf("Gallery"), baseColor: color });
            this.toggle.onStateChange(function (isLeft) {
                if (isLeft) {
                    _this.hideGallery();
                }
                else {
                    _this.showGallery();
                }
            });
            this.toggle.layout();
            this.toggle.translate((pxtblockly.TOTAL_WIDTH - this.toggle.width()) / 2, 0);
            div.appendChild(this.topDiv);
            div.appendChild(this.gallery.getElement());
            this.editorDiv = document.createElement("div");
            pxt.BrowserUtils.addClass(this.editorDiv, "melody-editor-div");
            this.editorDiv.style.setProperty("background-color", secondaryColor);
            this.gridDiv = this.createGridDisplay();
            this.editorDiv.appendChild(this.gridDiv);
            this.bottomDiv = document.createElement("div");
            pxt.BrowserUtils.addClass(this.bottomDiv, "melody-bottom-bar-div");
            this.doneButton = document.createElement("button");
            pxt.BrowserUtils.addClass(this.doneButton, "melody-confirm-button");
            this.doneButton.innerText = lf("Done");
            this.doneButton.addEventListener("click", function () { return _this.onDone(); });
            this.doneButton.style.setProperty("background-color", color);
            this.playButton = document.createElement("button");
            this.playButton.id = "melody-play-button";
            this.playButton.addEventListener("click", function () { return _this.togglePlay(); });
            this.playIcon = document.createElement("i");
            this.playIcon.id = "melody-play-icon";
            pxt.BrowserUtils.addClass(this.playIcon, "play icon");
            this.playButton.appendChild(this.playIcon);
            this.tempoInput = document.createElement("input");
            pxt.BrowserUtils.addClass(this.tempoInput, "ui input");
            this.tempoInput.type = "number";
            this.tempoInput.title = lf("tempo");
            this.tempoInput.id = "melody-tempo-input";
            this.tempoInput.addEventListener("input", function () { return _this.setTempo(+_this.tempoInput.value); });
            this.syncTempoField(true);
            this.bottomDiv.appendChild(this.tempoInput);
            this.bottomDiv.appendChild(this.playButton);
            this.bottomDiv.appendChild(this.doneButton);
            this.editorDiv.appendChild(this.bottomDiv);
            div.appendChild(this.editorDiv);
        };
        // Runs when the editor is closed by clicking on the Blockly workspace
        FieldCustomMelody.prototype.onEditorClose = function () {
            this.stopMelody();
            if (this.gallery) {
                this.gallery.stopMelody();
            }
            this.clearDomReferences();
            if (this.sourceBlock_ && Blockly.Events.isEnabled() && this.getValue() !== this.prevString) {
                Blockly.Events.fire(new Blockly.Events.BlockChange(this.sourceBlock_, 'field', this.name, this.prevString, this.getValue()));
            }
            this.prevString = undefined;
        };
        // when click done
        FieldCustomMelody.prototype.onDone = function () {
            Blockly.DropDownDiv.hideIfOwner(this);
            this.onEditorClose();
        };
        FieldCustomMelody.prototype.clearDomReferences = function () {
            this.topDiv = null;
            this.editorDiv = null;
            this.gridDiv = null;
            this.bottomDiv = null;
            this.doneButton = null;
            this.playButton = null;
            this.playIcon = null;
            this.tempoInput = null;
            this.elt = null;
            this.cells = null;
            this.toggle = null;
            this.root = null;
            this.gallery.clearDomReferences();
        };
        // This is the string that will be inserted into the user's TypeScript code
        FieldCustomMelody.prototype.getTypeScriptValue = function () {
            if (this.invalidString) {
                return this.invalidString;
            }
            if (this.melody) {
                return "\"" + this.melody.getStringRepresentation() + "\"";
            }
            return "";
        };
        // This should parse the string returned by getTypeScriptValue() and restore the state based on that
        FieldCustomMelody.prototype.parseTypeScriptValue = function (value) {
            var _this = this;
            var oldValue = value;
            try {
                value = value.slice(1, -1); // remove the boundary quotes
                value = value.trim(); // remove boundary white space
                this.createMelodyIfDoesntExist();
                var notes = value.split(" ");
                notes.forEach(function (n) {
                    if (!_this.isValidNote(n))
                        throw new Error(lf("Invalid note '{0}'. Notes can be C D E F G A B C5", n));
                });
                this.melody.resetMelody();
                for (var j = 0; j < notes.length; j++) {
                    if (notes[j] != "-") {
                        var rowPos = pxtmelody.noteToRow(notes[j]);
                        this.melody.updateMelody(rowPos, j);
                    }
                }
                this.updateFieldLabel();
            }
            catch (e) {
                pxt.log(e);
                this.invalidString = oldValue;
            }
        };
        FieldCustomMelody.prototype.isValidNote = function (note) {
            switch (note) {
                case "C":
                case "D":
                case "E":
                case "F":
                case "G":
                case "A":
                case "B":
                case "C5":
                case "-": return true;
            }
            return false;
        };
        // The width of the preview on the block itself
        FieldCustomMelody.prototype.getPreviewWidth = function () {
            this.updateSize_();
            return this.size_.width;
        };
        // The height of the preview on the block itself
        FieldCustomMelody.prototype.getPreviewHeight = function () {
            return this.constants_.FIELD_BORDER_RECT_HEIGHT;
        };
        FieldCustomMelody.prototype.getDropdownBackgroundColour = function () {
            return this.sourceBlock_.parentBlock_.getColour();
        };
        FieldCustomMelody.prototype.getDropdownBorderColour = function () {
            return this.sourceBlock_.parentBlock_.getColourTertiary();
        };
        FieldCustomMelody.prototype.updateFieldLabel = function () {
            if (!this.fieldGroup_)
                return;
            pxsim.U.clear(this.fieldGroup_);
            var musicIcon = mkText("\uf001")
                .appendClass("melody-editor-field-icon")
                .at(6, 15);
            this.fieldGroup_.appendChild(musicIcon.el);
            var notes = this.melody.getStringRepresentation().trim().split(" ");
            for (var i = 0; i < notes.length; i++) {
                var className = pxtmelody.getColorClass(pxtmelody.noteToRow(notes[i]));
                var cb = new svg.Rect()
                    .at((FieldCustomMelody.COLOR_BLOCK_WIDTH + FieldCustomMelody.COLOR_BLOCK_SPACING) * i + FieldCustomMelody.COLOR_BLOCK_X, FieldCustomMelody.COLOR_BLOCK_Y)
                    .size(FieldCustomMelody.COLOR_BLOCK_WIDTH, FieldCustomMelody.COLOR_BLOCK_HEIGHT)
                    .stroke("#898989", 1)
                    .corners(3, 2);
                pxt.BrowserUtils.addClass(cb.el, className);
                this.fieldGroup_.appendChild(cb.el);
            }
        };
        FieldCustomMelody.prototype.setTempo = function (tempo) {
            // reset text input if input is invalid
            if ((isNaN(tempo) || tempo <= 0) && this.tempoInput) {
                this.tempoInput.value = this.tempo + "";
                return;
            }
            // update tempo and display to reflect new tempo
            if (this.tempo != tempo) {
                this.tempo = tempo;
                if (this.melody) {
                    this.melody.setTempo(this.tempo);
                }
                if (this.tempoInput) {
                    this.tempoInput.value = this.tempo + "";
                }
                this.syncTempoField(false);
            }
        };
        // sync value from tempo field on block with tempo in field editor
        FieldCustomMelody.prototype.syncTempoField = function (blockToEditor) {
            var s = this.sourceBlock_;
            if (s.parentBlock_) {
                var p = s.parentBlock_;
                for (var _i = 0, _a = p.inputList; _i < _a.length; _i++) {
                    var input = _a[_i];
                    if (input.name === "tempo") {
                        var tempoBlock = input.connection.targetBlock();
                        if (tempoBlock) {
                            if (blockToEditor)
                                if (tempoBlock.getFieldValue("SLIDER")) {
                                    this.tempoInput.value = tempoBlock.getFieldValue("SLIDER");
                                    this.tempo = +this.tempoInput.value;
                                }
                                else {
                                    this.tempoInput.value = this.tempo + "";
                                }
                            else { // Editor to block
                                if (tempoBlock.type === "math_number_minmax") {
                                    tempoBlock.setFieldValue(this.tempoInput.value, "SLIDER");
                                }
                                else {
                                    tempoBlock.setFieldValue(this.tempoInput.value, "NUM");
                                }
                                this.tempoInput.focus();
                            }
                        }
                        break;
                    }
                }
            }
        };
        // ms to hold note
        FieldCustomMelody.prototype.getDuration = function () {
            return 60000 / this.tempo;
        };
        FieldCustomMelody.prototype.createMelodyIfDoesntExist = function () {
            if (!this.melody) {
                this.melody = new pxtmelody.MelodyArray();
                return true;
            }
            return false;
        };
        FieldCustomMelody.prototype.onNoteSelect = function (row, col) {
            // update melody array
            this.invalidString = null;
            this.melody.updateMelody(row, col);
            if (this.melody.getValue(row, col) && !this.isPlaying) {
                this.playNote(row, col);
            }
            this.updateGrid();
            this.updateFieldLabel();
        };
        FieldCustomMelody.prototype.updateGrid = function () {
            for (var row = 0; row < this.numRow; row++) {
                var rowClass = pxtmelody.getColorClass(row);
                for (var col = 0; col < this.numCol; col++) {
                    var cell = this.cells[row][col];
                    if (this.melody.getValue(row, col)) {
                        pxt.BrowserUtils.removeClass(cell, "melody-default");
                        pxt.BrowserUtils.addClass(cell, rowClass);
                    }
                    else {
                        pxt.BrowserUtils.addClass(cell, "melody-default");
                        pxt.BrowserUtils.removeClass(cell, rowClass);
                    }
                }
            }
        };
        FieldCustomMelody.prototype.playNote = function (rowNumber, colNumber) {
            var _this = this;
            var count = ++this.soundingKeys;
            if (this.isPlaying) {
                this.timeouts.push(setTimeout(function () {
                    _this.playToneCore(rowNumber);
                }, colNumber * this.getDuration()));
                this.timeouts.push(setTimeout(function () {
                    pxt.AudioContextManager.stop();
                }, (colNumber + 1) * this.getDuration()));
            }
            else {
                this.playToneCore(rowNumber);
                this.timeouts.push(setTimeout(function () {
                    if (_this.soundingKeys == count)
                        pxt.AudioContextManager.stop();
                }, this.getDuration()));
            }
        };
        FieldCustomMelody.prototype.queueToneForColumn = function (column, delay, duration) {
            var _this = this;
            var start = setTimeout(function () {
                ++_this.soundingKeys;
                pxt.AudioContextManager.stop();
                for (var i = 0; i < _this.numRow; i++) {
                    if (_this.melody.getValue(i, column)) {
                        _this.playToneCore(i);
                    }
                }
                _this.highlightColumn(column, true);
                _this.timeouts = _this.timeouts.filter(function (t) { return t !== start; });
            }, delay);
            var end = setTimeout(function () {
                // pxt.AudioContextManager.stop();
                _this.timeouts = _this.timeouts.filter(function (t) { return t !== end; });
                _this.highlightColumn(column, false);
            }, delay + duration);
            this.timeouts.push(start);
            this.timeouts.push(end);
        };
        FieldCustomMelody.prototype.playToneCore = function (row) {
            var tone = 0;
            switch (row) {
                case 0:
                    tone = 523;
                    break; // Tenor C
                case 1:
                    tone = 494;
                    break; // Middle B
                case 2:
                    tone = 440;
                    break; // Middle A
                case 3:
                    tone = 392;
                    break; // Middle G
                case 4:
                    tone = 349;
                    break; // Middle F
                case 5:
                    tone = 330;
                    break; // Middle E
                case 6:
                    tone = 294;
                    break; // Middle D
                case 7:
                    tone = 262;
                    break; // Middle C
            }
            pxt.AudioContextManager.tone(tone);
        };
        FieldCustomMelody.prototype.highlightColumn = function (col, on) {
            var cells = this.cells.map(function (row) { return row[col]; });
            cells.forEach(function (cell) {
                if (on)
                    pxt.BrowserUtils.addClass(cell, "playing");
                else
                    pxt.BrowserUtils.removeClass(cell, "playing");
            });
        };
        FieldCustomMelody.prototype.createGridDisplay = function () {
            FieldCustomMelody.VIEWBOX_WIDTH = (FieldCustomMelody.CELL_WIDTH + FieldCustomMelody.CELL_VERTICAL_MARGIN) * this.numCol + FieldCustomMelody.CELL_VERTICAL_MARGIN;
            if (pxt.BrowserUtils.isEdge())
                FieldCustomMelody.VIEWBOX_WIDTH += 37;
            FieldCustomMelody.VIEWBOX_HEIGHT = (FieldCustomMelody.CELL_WIDTH + FieldCustomMelody.CELL_HORIZONTAL_MARGIN) * this.numRow + FieldCustomMelody.CELL_HORIZONTAL_MARGIN;
            this.elt = pxsim.svg.parseString("<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"melody-grid-div\" viewBox=\"0 0 " + FieldCustomMelody.VIEWBOX_WIDTH + " " + FieldCustomMelody.VIEWBOX_HEIGHT + "\"/>");
            // Create the cells of the matrix that is displayed
            this.cells = []; // initialize array that holds rect svg elements
            for (var i = 0; i < this.numRow; i++) {
                this.cells.push([]);
            }
            for (var i = 0; i < this.numRow; i++) {
                for (var j = 0; j < this.numCol; j++) {
                    this.createCell(i, j);
                }
            }
            return this.elt;
        };
        FieldCustomMelody.prototype.createCell = function (x, y) {
            var _this = this;
            var tx = x * (FieldCustomMelody.CELL_WIDTH + FieldCustomMelody.CELL_HORIZONTAL_MARGIN) + FieldCustomMelody.CELL_HORIZONTAL_MARGIN;
            var ty = y * (FieldCustomMelody.CELL_WIDTH + FieldCustomMelody.CELL_VERTICAL_MARGIN) + FieldCustomMelody.CELL_VERTICAL_MARGIN;
            var cellG = pxsim.svg.child(this.elt, "g", { transform: "translate(" + ty + " " + tx + ")" });
            var cellRect = pxsim.svg.child(cellG, "rect", {
                'cursor': 'pointer',
                'width': FieldCustomMelody.CELL_WIDTH,
                'height': FieldCustomMelody.CELL_WIDTH,
                'stroke': 'white',
                'data-x': x,
                'data-y': y,
                'rx': FieldCustomMelody.CELL_CORNER_RADIUS
            });
            // add appropriate class so the cell has the correct fill color
            if (this.melody.getValue(x, y))
                pxt.BrowserUtils.addClass(cellRect, pxtmelody.getColorClass(x));
            else
                pxt.BrowserUtils.addClass(cellRect, "melody-default");
            if (this.sourceBlock_.workspace.isFlyout)
                return;
            pxsim.pointerEvents.down.forEach(function (evid) { return cellRect.addEventListener(evid, function (ev) {
                _this.onNoteSelect(x, y);
                ev.stopPropagation();
                ev.preventDefault();
            }, false); });
            this.cells[x][y] = cellRect;
        };
        FieldCustomMelody.prototype.togglePlay = function () {
            if (!this.isPlaying) {
                this.isPlaying = true;
                this.playMelody();
            }
            else {
                this.stopMelody();
            }
            this.updatePlayButton();
        };
        FieldCustomMelody.prototype.updatePlayButton = function () {
            if (this.isPlaying) {
                pxt.BrowserUtils.removeClass(this.playIcon, "play icon");
                pxt.BrowserUtils.addClass(this.playIcon, "stop icon");
            }
            else {
                pxt.BrowserUtils.removeClass(this.playIcon, "stop icon");
                pxt.BrowserUtils.addClass(this.playIcon, "play icon");
            }
        };
        FieldCustomMelody.prototype.playMelody = function () {
            var _this = this;
            if (this.isPlaying) {
                for (var i = 0; i < this.numCol; i++) {
                    this.queueToneForColumn(i, i * this.getDuration(), this.getDuration());
                }
                this.timeouts.push(setTimeout(// call the melody again after it finishes
                function () { return _this.playMelody(); }, (this.numCol) * this.getDuration()));
            }
            else {
                this.stopMelody();
            }
        };
        FieldCustomMelody.prototype.stopMelody = function () {
            if (this.isPlaying) {
                while (this.timeouts.length)
                    clearTimeout(this.timeouts.shift());
                pxt.AudioContextManager.stop();
                this.isPlaying = false;
                this.cells.forEach(function (row) { return row.forEach(function (cell) { return pxt.BrowserUtils.removeClass(cell, "playing"); }); });
            }
        };
        FieldCustomMelody.prototype.showGallery = function () {
            var _this = this;
            this.stopMelody();
            this.updatePlayButton();
            this.gallery.show(function (result) {
                if (result) {
                    _this.melody.parseNotes(result);
                    _this.gallery.hide();
                    _this.toggle.toggle();
                    _this.updateFieldLabel();
                    _this.updateGrid();
                }
            });
        };
        FieldCustomMelody.prototype.hideGallery = function () {
            this.gallery.hide();
        };
        // grid elements
        FieldCustomMelody.CELL_WIDTH = 25;
        FieldCustomMelody.CELL_HORIZONTAL_MARGIN = 7;
        FieldCustomMelody.CELL_VERTICAL_MARGIN = 5;
        FieldCustomMelody.CELL_CORNER_RADIUS = 5;
        // preview field elements
        FieldCustomMelody.COLOR_BLOCK_WIDTH = 10;
        FieldCustomMelody.COLOR_BLOCK_HEIGHT = 20;
        FieldCustomMelody.COLOR_BLOCK_X = 20;
        FieldCustomMelody.COLOR_BLOCK_Y = 5;
        FieldCustomMelody.COLOR_BLOCK_SPACING = 2;
        FieldCustomMelody.MUSIC_ICON_WIDTH = 20;
        return FieldCustomMelody;
    }(Blockly.Field));
    pxtblockly.FieldCustomMelody = FieldCustomMelody;
    var TOGGLE_WIDTH = 200;
    var TOGGLE_HEIGHT = 40;
    var TOGGLE_BORDER_WIDTH = 2;
    var TOGGLE_CORNER_RADIUS = 4;
    var BUTTON_CORNER_RADIUS = 2;
    var BUTTON_BORDER_WIDTH = 1;
    var BUTTON_BOTTOM_BORDER_WIDTH = 2;
    var Toggle = /** @class */ (function () {
        function Toggle(parent, props) {
            this.props = defaultColors(props);
            this.root = parent.group();
            this.buildDom();
            this.isLeft = true;
        }
        Toggle.prototype.buildDom = function () {
            var _this = this;
            // Our css minifier mangles animation names so they need to be injected manually
            this.root.style().content("\n            .toggle-left {\n                transform: translateX(0px);\n                animation: mvleft 0.2s 0s ease;\n            }\n\n            .toggle-right {\n                transform: translateX(100px);\n                animation: mvright 0.2s 0s ease;\n            }\n\n            @keyframes mvright {\n                0% {\n                    transform: translateX(0px);\n                }\n                100% {\n                    transform: translateX(100px);\n                }\n            }\n\n            @keyframes mvleft {\n                0% {\n                    transform: translateX(100px);\n                }\n                100% {\n                    transform: translateX(0px);\n                }\n            }\n            ");
            // The outer border has an inner-stroke so we need to clip out the outer part
            // because SVG's don't support "inner borders"
            var clip = this.root.def().create("clipPath", "sprite-editor-toggle-border")
                .clipPathUnits(true);
            clip.draw("rect")
                .at(0, 0)
                .corners(TOGGLE_CORNER_RADIUS / TOGGLE_WIDTH, TOGGLE_CORNER_RADIUS / TOGGLE_HEIGHT)
                .size(1, 1);
            // Draw the outer border
            this.root.draw("rect")
                .size(TOGGLE_WIDTH, TOGGLE_HEIGHT)
                .fill(this.props.baseColor)
                .stroke(this.props.borderColor, TOGGLE_BORDER_WIDTH * 2)
                .corners(TOGGLE_CORNER_RADIUS, TOGGLE_CORNER_RADIUS)
                .clipPath("url(#sprite-editor-toggle-border)");
            // Draw the background
            this.root.draw("rect")
                .at(TOGGLE_BORDER_WIDTH, TOGGLE_BORDER_WIDTH)
                .size(TOGGLE_WIDTH - TOGGLE_BORDER_WIDTH * 2, TOGGLE_HEIGHT - TOGGLE_BORDER_WIDTH * 2)
                .fill(this.props.backgroundColor)
                .corners(TOGGLE_CORNER_RADIUS, TOGGLE_CORNER_RADIUS);
            // Draw the switch
            this.switch = this.root.draw("rect")
                .at(TOGGLE_BORDER_WIDTH, TOGGLE_BORDER_WIDTH)
                .size((TOGGLE_WIDTH - TOGGLE_BORDER_WIDTH * 2) / 2, TOGGLE_HEIGHT - TOGGLE_BORDER_WIDTH * 2)
                .fill(this.props.switchColor)
                .corners(TOGGLE_CORNER_RADIUS, TOGGLE_CORNER_RADIUS);
            // Draw the left option
            this.leftElement = this.root.group();
            this.leftText = mkText(this.props.leftText)
                .appendClass("sprite-editor-text")
                .fill(this.props.selectedTextColor);
            this.leftElement.appendChild(this.leftText);
            // Draw the right option
            this.rightElement = this.root.group();
            this.rightText = mkText(this.props.rightText)
                .appendClass("sprite-editor-text")
                .fill(this.props.unselectedTextColor);
            this.rightElement.appendChild(this.rightText);
            this.root.onClick(function () { return _this.toggle(); });
        };
        Toggle.prototype.toggle = function (quiet) {
            if (quiet === void 0) { quiet = false; }
            if (this.isLeft) {
                this.switch.removeClass("toggle-left");
                this.switch.appendClass("toggle-right");
                this.leftText.fill(this.props.unselectedTextColor);
                this.rightText.fill(this.props.selectedTextColor);
            }
            else {
                this.switch.removeClass("toggle-right");
                this.switch.appendClass("toggle-left");
                this.leftText.fill(this.props.selectedTextColor);
                this.rightText.fill(this.props.unselectedTextColor);
            }
            this.isLeft = !this.isLeft;
            if (!quiet && this.changeHandler) {
                this.changeHandler(this.isLeft);
            }
        };
        Toggle.prototype.onStateChange = function (handler) {
            this.changeHandler = handler;
        };
        Toggle.prototype.layout = function () {
            var centerOffset = (TOGGLE_WIDTH - TOGGLE_BORDER_WIDTH * 2) / 4;
            this.leftText.moveTo(centerOffset + TOGGLE_BORDER_WIDTH, TOGGLE_HEIGHT / 2);
            this.rightText.moveTo(TOGGLE_WIDTH - TOGGLE_BORDER_WIDTH - centerOffset, TOGGLE_HEIGHT / 2);
        };
        Toggle.prototype.translate = function (x, y) {
            this.root.translate(x, y);
        };
        Toggle.prototype.height = function () {
            return TOGGLE_HEIGHT;
        };
        Toggle.prototype.width = function () {
            return TOGGLE_WIDTH;
        };
        return Toggle;
    }());
    function mkText(text) {
        return new svg.Text(text)
            .anchor("middle")
            .setAttribute("dominant-baseline", "middle")
            .setAttribute("dy", (pxt.BrowserUtils.isIE() || pxt.BrowserUtils.isEdge()) ? "0.3em" : "0.1em");
    }
    function defaultColors(props) {
        if (!props.baseColor)
            props.baseColor = "#e95153";
        if (!props.backgroundColor)
            props.backgroundColor = "rgba(52,73,94,.2)";
        if (!props.borderColor)
            props.borderColor = "rgba(52,73,94,.4)";
        if (!props.selectedTextColor)
            props.selectedTextColor = props.baseColor;
        if (!props.unselectedTextColor)
            props.unselectedTextColor = "hsla(0,0%,100%,.9)";
        if (!props.switchColor)
            props.switchColor = "#ffffff";
        return props;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var Note;
    (function (Note) {
        Note[Note["C"] = 262] = "C";
        Note[Note["CSharp"] = 277] = "CSharp";
        Note[Note["D"] = 294] = "D";
        Note[Note["Eb"] = 311] = "Eb";
        Note[Note["E"] = 330] = "E";
        Note[Note["F"] = 349] = "F";
        Note[Note["FSharp"] = 370] = "FSharp";
        Note[Note["G"] = 392] = "G";
        Note[Note["GSharp"] = 415] = "GSharp";
        Note[Note["A"] = 440] = "A";
        Note[Note["Bb"] = 466] = "Bb";
        Note[Note["B"] = 494] = "B";
        Note[Note["C3"] = 131] = "C3";
        Note[Note["CSharp3"] = 139] = "CSharp3";
        Note[Note["D3"] = 147] = "D3";
        Note[Note["Eb3"] = 156] = "Eb3";
        Note[Note["E3"] = 165] = "E3";
        Note[Note["F3"] = 175] = "F3";
        Note[Note["FSharp3"] = 185] = "FSharp3";
        Note[Note["G3"] = 196] = "G3";
        Note[Note["GSharp3"] = 208] = "GSharp3";
        Note[Note["A3"] = 220] = "A3";
        Note[Note["Bb3"] = 233] = "Bb3";
        Note[Note["B3"] = 247] = "B3";
        Note[Note["C4"] = 262] = "C4";
        Note[Note["CSharp4"] = 277] = "CSharp4";
        Note[Note["D4"] = 294] = "D4";
        Note[Note["Eb4"] = 311] = "Eb4";
        Note[Note["E4"] = 330] = "E4";
        Note[Note["F4"] = 349] = "F4";
        Note[Note["FSharp4"] = 370] = "FSharp4";
        Note[Note["G4"] = 392] = "G4";
        Note[Note["GSharp4"] = 415] = "GSharp4";
        Note[Note["A4"] = 440] = "A4";
        Note[Note["Bb4"] = 466] = "Bb4";
        Note[Note["B4"] = 494] = "B4";
        Note[Note["C5"] = 523] = "C5";
        Note[Note["CSharp5"] = 555] = "CSharp5";
        Note[Note["D5"] = 587] = "D5";
        Note[Note["Eb5"] = 622] = "Eb5";
        Note[Note["E5"] = 659] = "E5";
        Note[Note["F5"] = 698] = "F5";
        Note[Note["FSharp5"] = 740] = "FSharp5";
        Note[Note["G5"] = 784] = "G5";
        Note[Note["GSharp5"] = 831] = "GSharp5";
        Note[Note["A5"] = 880] = "A5";
        Note[Note["Bb5"] = 932] = "Bb5";
        Note[Note["B5"] = 988] = "B5";
        Note[Note["C6"] = 1047] = "C6";
        Note[Note["CSharp6"] = 1109] = "CSharp6";
        Note[Note["D6"] = 1175] = "D6";
        Note[Note["Eb6"] = 1245] = "Eb6";
        Note[Note["E6"] = 1319] = "E6";
        Note[Note["F6"] = 1397] = "F6";
        Note[Note["FSharp6"] = 1480] = "FSharp6";
        Note[Note["G6"] = 1568] = "G6";
        Note[Note["GSharp6"] = 1568] = "GSharp6";
        Note[Note["A6"] = 1760] = "A6";
        Note[Note["Bb6"] = 1865] = "Bb6";
        Note[Note["B6"] = 1976] = "B6";
        Note[Note["C7"] = 2093] = "C7";
    })(Note || (Note = {}));
    var FieldNote = /** @class */ (function (_super) {
        __extends(FieldNote, _super);
        function FieldNote(text, params, validator) {
            var _this = 
            // passing null as we need more state before we properly set value.
            _super.call(this, null, 0, null, null, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.isTextValid_ = true;
            /**
             * default number of piano keys
             */
            _this.nKeys_ = 36;
            _this.minNote_ = 28;
            _this.maxNote_ = 63;
            /** Absolute error for note frequency identification (Hz) **/
            _this.eps = 2;
            _this.setSpellcheck(false);
            _this.prepareNotes();
            _this.isExpanded = false;
            _this.currentPage = 0;
            _this.totalPlayCount = 0;
            if (params.editorColour) {
                _this.primaryColour = pxtblockly.parseColour(params.editorColour);
                _this.borderColour = Blockly.utils.colour.darken(_this.primaryColour, 0.2);
            }
            var eps = parseInt(params.eps);
            if (!Number.isNaN(eps) && eps >= 0) {
                _this.eps = eps;
            }
            var minNote = parseInt(params.minNote) || _this.minNote_;
            var maxNote = parseInt(params.maxNote) || _this.maxNote_;
            if (minNote >= 28 && maxNote <= 75 && maxNote > minNote) {
                _this.minNote_ = minNote;
                _this.maxNote_ = maxNote;
                _this.nKeys_ = _this.maxNote_ - _this.minNote_ + 1;
            }
            _this.setValue(text);
            return _this;
        }
        /**
         * Ensure that only a non negative number may be entered.
         * @param {string} text The user's text.
         * @return A string representing a valid positive number, or null if invalid.
         */
        FieldNote.prototype.doClassValidation_ = function (text) {
            // accommodate note strings like "Note.GSharp5" as well as numbers
            var match = /^Note\.(.+)$/.exec(text);
            var noteName = (match && match.length > 1) ? match[1] : null;
            text = Note[noteName] ? Note[noteName] : String(parseFloat(text || "0"));
            if (text === null) {
                return null;
            }
            var n = parseFloat(text || "0");
            if (isNaN(n) || n < 0) {
                return null;
            }
            var showDecimal = Math.floor(n) != n;
            return "" + n.toFixed(showDecimal ? 2 : 0);
        };
        /**
         * Return the current note frequency.
         * @return Current note in string format.
         */
        FieldNote.prototype.getValue = function () {
            return this.value_ + "";
        };
        /**
         * Called by setValue if the text input is valid. Updates the value of the
         * field, and updates the text of the field if it is not currently being
         * edited (i.e. handled by the htmlInput_).
         * @param {string} note The new note in string format.
         */
        FieldNote.prototype.doValueUpdate_ = function (note) {
            if (isNaN(Number(note)) || Number(note) < 0)
                return;
            if (this.sourceBlock_ && Blockly.Events.isEnabled() && this.value_ != note) {
                Blockly.Events.fire(new Blockly.Events.Change(this.sourceBlock_, "field", this.name, this.value_, note));
            }
            this.value_ = note;
            this.refreshText();
        };
        /**
         * Get the text from this field
         * @return Current text.
         */
        FieldNote.prototype.getText = function () {
            if (this.isExpanded) {
                return "" + this.value_;
            }
            else {
                var note = +this.value_;
                for (var i = 0; i < this.nKeys_; i++) {
                    if (Math.abs(this.getKeyFreq(i) - note) < this.eps) {
                        return this.getKeyName(i);
                    }
                }
                var text = note.toString();
                if (!isNaN(note))
                    text += " Hz";
                return text;
            }
        };
        /**
         * This block shows up differently when it's being edited;
         * on any transition between `editing <--> not-editing`
         * or other change in state,
         * refresh the text to get back into a valid state.
         **/
        FieldNote.prototype.refreshText = function () {
            this.forceRerender();
        };
        FieldNote.prototype.onHtmlInputChange_ = function (e) {
            _super.prototype.onHtmlInputChange_.call(this, e);
            Blockly.DropDownDiv.hideWithoutAnimation();
            this.htmlInput_.focus();
        };
        FieldNote.prototype.onFinishEditing_ = function (text) {
            this.refreshText();
        };
        FieldNote.prototype.onHide = function () {
            this.isExpanded = false;
            this.refreshText();
        };
        ;
        /**
         * Create a piano under the note field.
         */
        FieldNote.prototype.showEditor_ = function (e) {
            var _this = this;
            this.isExpanded = true;
            this.updateColor();
            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            var isMobile = pxt.BrowserUtils.isMobile() || pxt.BrowserUtils.isIOS();
            // invoke FieldTextInputs showeditor, so we can set quiet explicitly / not have a pop up dialogue
            FieldNote.superClass_.showEditor_.call(this, e, /** quiet **/ isMobile, /** readonly **/ isMobile);
            this.refreshText();
            // save all changes in the same group of events
            Blockly.Events.setGroup(true);
            this.piano = [];
            this.currentSelectedKey = undefined;
            var totalWhiteKeys = this.nKeys_ - (this.nKeys_ / FieldNote.notesPerOctave * FieldNote.blackKeysPerOctave);
            var whiteKeysPerOctave = FieldNote.notesPerOctave - FieldNote.blackKeysPerOctave;
            var pianoWidth = FieldNote.keyWidth * totalWhiteKeys;
            var pianoHeight = FieldNote.keyHeight + FieldNote.labelHeight;
            var pagination = window.innerWidth < pianoWidth;
            if (pagination) {
                pianoWidth = whiteKeysPerOctave * FieldNote.keyWidth;
                pianoHeight = FieldNote.keyHeight + FieldNote.labelHeight + FieldNote.prevNextHeight;
            }
            var pianoDiv = createStyledDiv("blocklyPianoDiv", "width: " + pianoWidth + "px;\n                height: " + pianoHeight + "px;");
            Blockly.DropDownDiv.getContentDiv().appendChild(pianoDiv);
            // render note label
            this.noteLabel = createStyledDiv("blocklyNoteLabel", "top: " + FieldNote.keyHeight + "px;\n                width: " + pianoWidth + "px;\n                background-color: " + this.primaryColour + ";\n                border-color: " + this.primaryColour + ";");
            pianoDiv.appendChild(this.noteLabel);
            this.noteLabel.textContent = "-";
            var startingPage = 0;
            for (var i = 0; i < this.nKeys_; i++) {
                var currentOctave = Math.floor(i / FieldNote.notesPerOctave);
                var position = this.getPosition(i);
                // modify original position in pagination
                if (pagination && i >= FieldNote.notesPerOctave)
                    position -= whiteKeysPerOctave * currentOctave * FieldNote.keyWidth;
                var key = this.getKeyDiv(i, position);
                this.piano.push(key);
                pianoDiv.appendChild(key);
                // if the current value is within eps of this note, select it.
                if (Math.abs(this.getKeyFreq(i) - Number(this.getValue())) < this.eps) {
                    pxt.BrowserUtils.addClass(key, "selected");
                    this.currentSelectedKey = key;
                    startingPage = currentOctave;
                }
            }
            if (pagination) {
                this.setPage(startingPage);
                pianoDiv.appendChild(this.getNextPrevDiv(/** prev **/ true, pianoWidth));
                pianoDiv.appendChild(this.getNextPrevDiv(/** prev **/ false, pianoWidth));
            }
            Blockly.DropDownDiv.setColour(this.primaryColour, this.borderColour);
            Blockly.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_, function () { return _this.onHide(); });
        };
        FieldNote.prototype.playKey = function (key, frequency) {
            var _this = this;
            var notePlayID = ++this.totalPlayCount;
            if (this.currentSelectedKey !== key) {
                if (this.currentSelectedKey)
                    pxt.BrowserUtils.removeClass(this.currentSelectedKey, "selected");
                pxt.BrowserUtils.addClass(key, "selected");
                this.setValue(frequency);
            }
            this.currentSelectedKey = key;
            /**
             * force a rerender of the preview; other attempts at changing the value
             * do not show up on the block itself until after the fieldeditor is closed,
             * as it is currently in an editable state.
             **/
            this.htmlInput_.value = this.getText();
            pxt.AudioContextManager.tone(frequency);
            setTimeout(function () {
                // Clear the sound if it is still playing after 300ms
                if (_this.totalPlayCount == notePlayID)
                    pxt.AudioContextManager.stop();
            }, 300);
        };
        /**
         * Close the note picker if this input is being deleted.
         */
        FieldNote.prototype.dispose = function () {
            Blockly.DropDownDiv.hideIfOwner(this);
            _super.prototype.dispose.call(this);
        };
        FieldNote.prototype.updateColor = function () {
            if (this.sourceBlock_.parentBlock_ && (this.sourceBlock_.isShadow() || hasOnlyOneField(this.sourceBlock_))) {
                var b = this.sourceBlock_.parentBlock_;
                this.primaryColour = b.getColour();
                this.borderColour = b.getColourTertiary();
            }
            else {
                var b = this.sourceBlock_;
                this.primaryColour = b.getColourTertiary();
                this.borderColour = b.getColourTertiary();
            }
        };
        FieldNote.prototype.setPage = function (page) {
            var pageCount = this.nKeys_ / FieldNote.notesPerOctave;
            page = Math.max(Math.min(page, pageCount - 1), 0);
            this.noteLabel.textContent = "Octave #" + (page + 1);
            var firstKeyInOctave = page * FieldNote.notesPerOctave;
            for (var i = 0; i < this.piano.length; ++i) {
                var isInOctave = i >= firstKeyInOctave && i < firstKeyInOctave + FieldNote.notesPerOctave;
                this.piano[i].style.display = isInOctave ? "block" : "none";
            }
            this.currentPage = page;
        };
        ;
        /**
         * create a DOM to assign a style to the previous and next buttons
         * @param pianoWidth the width of the containing piano
         * @param isPrev true if is previous button, false otherwise
         * @return DOM with the new css style.s
         */
        FieldNote.prototype.getNextPrevDiv = function (isPrev, pianoWidth) {
            var _this = this;
            var xPosition = isPrev ? 0 : (pianoWidth / 2);
            var yPosition = FieldNote.keyHeight + FieldNote.labelHeight;
            var output = createStyledDiv("blocklyNotePrevNext", "top: " + yPosition + "px;\n                left: " + xPosition + "px;\n                width: " + Math.ceil(pianoWidth / 2) + "px;\n                " + (isPrev ? "border-left-color" : "border-right-color") + ": " + this.primaryColour + ";\n                background-color: " + this.primaryColour + ";\n                border-bottom-color: " + this.primaryColour + ";");
            pxt.BrowserUtils.pointerEvents.down.forEach(function (ev) {
                Blockly.bindEventWithChecks_(output, ev, _this, function () { return _this.setPage(isPrev ? _this.currentPage - 1 : _this.currentPage + 1); }, 
                /** noCaptureIdentifier **/ true);
            });
            output.textContent = isPrev ? "<" : ">";
            return output;
        };
        FieldNote.prototype.getKeyDiv = function (keyInd, leftPosition) {
            var _this = this;
            var output = createStyledDiv("blocklyNote " + (this.isWhite(keyInd) ? "" : "black"), "width: " + this.getKeyWidth(keyInd) + "px;\n                height: " + this.getKeyHeight(keyInd) + "px;\n                left: " + leftPosition + "px;\n                border-color: " + this.primaryColour + ";");
            pxt.BrowserUtils.pointerEvents.down.forEach(function (ev) {
                Blockly.bindEventWithChecks_(output, ev, _this, function () { return _this.playKey(output, _this.getKeyFreq(keyInd)); }, 
                /** noCaptureIdentifier **/ true);
            });
            Blockly.bindEventWithChecks_(output, 'mouseover', this, function () { return _this.noteLabel.textContent = _this.getKeyName(keyInd); }, 
            /** noCaptureIdentifier **/ true);
            return output;
        };
        /**
         * @param idx index of the key
         * @return true if idx is white
         */
        FieldNote.prototype.isWhite = function (idx) {
            switch (idx % 12) {
                case 1:
                case 3:
                case 6:
                case 8:
                case 10:
                    return false;
                default:
                    return true;
            }
        };
        /**
         * get width of the piano key
         * @param idx index of the key
         * @return width of the key
         */
        FieldNote.prototype.getKeyWidth = function (idx) {
            if (this.isWhite(idx))
                return FieldNote.keyWidth;
            return FieldNote.keyWidth / 2;
        };
        /**
         * get height of the piano key
         * @param idx index of the key
         * @return height of the key
         */
        FieldNote.prototype.getKeyHeight = function (idx) {
            if (this.isWhite(idx))
                return FieldNote.keyHeight;
            return FieldNote.keyHeight / 2;
        };
        FieldNote.prototype.getKeyFreq = function (keyIndex) {
            return this.getKeyNoteData(keyIndex).freq;
        };
        FieldNote.prototype.getKeyName = function (keyIndex) {
            var note = this.getKeyNoteData(keyIndex);
            var name = note.prefixedName;
            if (this.nKeys_ <= FieldNote.notesPerOctave) {
                // special case: one octave
                name = note.name;
            }
            else if (this.minNote_ >= 28 && this.maxNote_ <= 63) {
                // special case: centered
                name = note.altPrefixedName || name;
            }
            return name;
        };
        FieldNote.prototype.getKeyNoteData = function (keyIndex) {
            return FieldNote.Notes[keyIndex + this.minNote_];
        };
        /**
         * get the position of the key in the piano
         * @param idx index of the key
         * @return position of the key
         */
        FieldNote.prototype.getPosition = function (idx) {
            var whiteKeyCount = idx - Math.floor((idx + 1) / FieldNote.notesPerOctave * FieldNote.blackKeysPerOctave);
            var pos = whiteKeyCount * FieldNote.keyWidth;
            if (this.isWhite(idx))
                return pos;
            return pos - (FieldNote.keyWidth / 4);
        };
        FieldNote.prototype.prepareNotes = function () {
            if (!FieldNote.Notes) {
                FieldNote.Notes = {
                    28: { name: lf("{id:note}C"), prefixedName: lf("Low C"), freq: 131 },
                    29: { name: lf("C#"), prefixedName: lf("Low C#"), freq: 139 },
                    30: { name: lf("{id:note}D"), prefixedName: lf("Low D"), freq: 147 },
                    31: { name: lf("D#"), prefixedName: lf("Low D#"), freq: 156 },
                    32: { name: lf("{id:note}E"), prefixedName: lf("Low E"), freq: 165 },
                    33: { name: lf("{id:note}F"), prefixedName: lf("Low F"), freq: 175 },
                    34: { name: lf("F#"), prefixedName: lf("Low F#"), freq: 185 },
                    35: { name: lf("{id:note}G"), prefixedName: lf("Low G"), freq: 196 },
                    36: { name: lf("G#"), prefixedName: lf("Low G#"), freq: 208 },
                    37: { name: lf("{id:note}A"), prefixedName: lf("Low A"), freq: 220 },
                    38: { name: lf("A#"), prefixedName: lf("Low A#"), freq: 233 },
                    39: { name: lf("{id:note}B"), prefixedName: lf("Low B"), freq: 247 },
                    40: { name: lf("{id:note}C"), prefixedName: lf("Middle C"), freq: 262 },
                    41: { name: lf("C#"), prefixedName: lf("Middle C#"), freq: 277 },
                    42: { name: lf("{id:note}D"), prefixedName: lf("Middle D"), freq: 294 },
                    43: { name: lf("D#"), prefixedName: lf("Middle D#"), freq: 311 },
                    44: { name: lf("{id:note}E"), prefixedName: lf("Middle E"), freq: 330 },
                    45: { name: lf("{id:note}F"), prefixedName: lf("Middle F"), freq: 349 },
                    46: { name: lf("F#"), prefixedName: lf("Middle F#"), freq: 370 },
                    47: { name: lf("{id:note}G"), prefixedName: lf("Middle G"), freq: 392 },
                    48: { name: lf("G#"), prefixedName: lf("Middle G#"), freq: 415 },
                    49: { name: lf("{id:note}A"), prefixedName: lf("Middle A"), freq: 440 },
                    50: { name: lf("A#"), prefixedName: lf("Middle A#"), freq: 466 },
                    51: { name: lf("{id:note}B"), prefixedName: lf("Middle B"), freq: 494 },
                    52: { name: lf("{id:note}C"), prefixedName: lf("Tenor C"), altPrefixedName: lf("High C"), freq: 523 },
                    53: { name: lf("C#"), prefixedName: lf("Tenor C#"), altPrefixedName: lf("High C#"), freq: 554 },
                    54: { name: lf("{id:note}D"), prefixedName: lf("Tenor D"), altPrefixedName: lf("High D"), freq: 587 },
                    55: { name: lf("D#"), prefixedName: lf("Tenor D#"), altPrefixedName: lf("High D#"), freq: 622 },
                    56: { name: lf("{id:note}E"), prefixedName: lf("Tenor E"), altPrefixedName: lf("High E"), freq: 659 },
                    57: { name: lf("{id:note}F"), prefixedName: lf("Tenor F"), altPrefixedName: lf("High F"), freq: 698 },
                    58: { name: lf("F#"), prefixedName: lf("Tenor F#"), altPrefixedName: lf("High F#"), freq: 740 },
                    59: { name: lf("{id:note}G"), prefixedName: lf("Tenor G"), altPrefixedName: lf("High G"), freq: 784 },
                    60: { name: lf("G#"), prefixedName: lf("Tenor G#"), altPrefixedName: lf("High G#"), freq: 831 },
                    61: { name: lf("{id:note}A"), prefixedName: lf("Tenor A"), altPrefixedName: lf("High A"), freq: 880 },
                    62: { name: lf("A#"), prefixedName: lf("Tenor A#"), altPrefixedName: lf("High A#"), freq: 932 },
                    63: { name: lf("{id:note}B"), prefixedName: lf("Tenor B"), altPrefixedName: lf("High B"), freq: 988 },
                    64: { name: lf("{id:note}C"), prefixedName: lf("High C"), freq: 1046 },
                    65: { name: lf("C#"), prefixedName: lf("High C#"), freq: 1109 },
                    66: { name: lf("{id:note}D"), prefixedName: lf("High D"), freq: 1175 },
                    67: { name: lf("D#"), prefixedName: lf("High D#"), freq: 1245 },
                    68: { name: lf("{id:note}E"), prefixedName: lf("High E"), freq: 1319 },
                    69: { name: lf("{id:note}F"), prefixedName: lf("High F"), freq: 1397 },
                    70: { name: lf("F#"), prefixedName: lf("High F#"), freq: 1478 },
                    71: { name: lf("{id:note}G"), prefixedName: lf("High G"), freq: 1568 },
                    72: { name: lf("G#"), prefixedName: lf("High G#"), freq: 1661 },
                    73: { name: lf("{id:note}A"), prefixedName: lf("High A"), freq: 1760 },
                    74: { name: lf("A#"), prefixedName: lf("High A#"), freq: 1865 },
                    75: { name: lf("{id:note}B"), prefixedName: lf("High B"), freq: 1976 }
                };
            }
        };
        FieldNote.keyWidth = 22;
        FieldNote.keyHeight = 90;
        FieldNote.labelHeight = 24;
        FieldNote.prevNextHeight = 20;
        FieldNote.notesPerOctave = 12;
        FieldNote.blackKeysPerOctave = 5;
        return FieldNote;
    }(Blockly.FieldNumber));
    pxtblockly.FieldNote = FieldNote;
    function hasOnlyOneField(block) {
        return block.inputList.length === 1 && block.inputList[0].fieldRow.length === 1;
    }
    function createStyledDiv(className, style) {
        var output = document.createElement("div");
        pxt.BrowserUtils.addClass(output, className);
        output.setAttribute("style", style.replace(/\s+/g, " "));
        return output;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldNumberDropdown = /** @class */ (function (_super) {
        __extends(FieldNumberDropdown, _super);
        function FieldNumberDropdown(value, options, opt_validator) {
            var _this = _super.call(this, value, options.data, options.min, options.max, options.precision, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldNumberDropdown.prototype.getOptions = function () {
            var newOptions;
            if (this.menuGenerator_) {
                newOptions = JSON.parse(this.menuGenerator_).map(function (x) {
                    return (typeof x == 'object') ? x : [String(x), String(x)];
                });
            }
            return newOptions;
        };
        return FieldNumberDropdown;
    }(Blockly.FieldNumberDropdown));
    pxtblockly.FieldNumberDropdown = FieldNumberDropdown;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts"/>
/// <reference path="../../built/pxtsim.d.ts"/>
var pxtblockly;
(function (pxtblockly) {
    var FieldPosition = /** @class */ (function (_super) {
        __extends(FieldPosition, _super);
        function FieldPosition(text, params, validator) {
            var _this = _super.call(this, text, '0', '100', '1', '100', 'Value', validator) || this;
            _this.isFieldCustom_ = true;
            _this.params = params;
            if (!_this.params.screenHeight)
                _this.params.screenHeight = 120;
            if (!_this.params.screenWidth)
                _this.params.screenWidth = 160;
            if (!_this.params.xInputName)
                _this.params.xInputName = "x";
            if (!_this.params.yInputName)
                _this.params.yInputName = "y";
            if (_this.params.min)
                _this.min_ = parseInt(_this.params.min);
            if (_this.params.max)
                _this.max_ = parseInt(_this.params.max);
            return _this;
        }
        FieldPosition.prototype.showEditor_ = function () {
            // Find out which field we're in (x or y) and set the appropriate max.
            var xField = this.getFieldByName(this.params.xInputName);
            if (xField === this) {
                this.max_ = this.params.screenWidth;
                this.labelText_ = this.params.xInputName;
            }
            var yField = this.getFieldByName(this.params.yInputName);
            if (yField === this) {
                this.max_ = this.params.screenHeight;
                this.labelText_ = this.params.yInputName;
            }
            // Call super to render the slider and show the dropdown div
            _super.prototype.showEditor_.call(this);
            // Now render the screen in the dropdown div below the slider
            this.renderScreenPicker();
        };
        FieldPosition.prototype.doValueUpdate_ = function (value) {
            _super.prototype.doValueUpdate_.call(this, value);
            if (this.resetCrosshair)
                this.resetCrosshair();
        };
        FieldPosition.prototype.renderScreenPicker = function () {
            var _this = this;
            var contentDiv = Blockly.DropDownDiv.getContentDiv();
            this.selectorDiv_ = document.createElement('div');
            this.selectorDiv_.className = "blocklyCanvasOverlayOuter";
            contentDiv.appendChild(this.selectorDiv_);
            var canvasOverlayDiv = document.createElement('div');
            canvasOverlayDiv.className = 'blocklyCanvasOverlayDiv';
            this.selectorDiv_.appendChild(canvasOverlayDiv);
            var crossX = document.createElement('div');
            crossX.className = 'cross-x';
            canvasOverlayDiv.appendChild(crossX);
            var crossY = document.createElement('div');
            crossY.className = 'cross-y';
            canvasOverlayDiv.appendChild(crossY);
            var label = document.createElement('div');
            label.className = 'label';
            canvasOverlayDiv.appendChild(label);
            var width = this.params.screenWidth * 1.5;
            var height = this.params.screenHeight * 1.5;
            canvasOverlayDiv.style.height = height + 'px';
            canvasOverlayDiv.style.width = width + 'px';
            // The slider is set to a fixed width, so we have to resize it
            // to match the screen size
            var slider = contentDiv.getElementsByClassName("goog-slider-horizontal")[0];
            if (slider) {
                slider.style.width = width + "px";
                // Because we resized the slider, we need to update the handle position. The closure
                // slider won't update unless the value changes so change it and un-change it
                var value = parseFloat(this.getValue());
                if (!isNaN(value) && value > this.getMin()) {
                    this.setValue((value - 1) + "");
                    this.setValue(value + "");
                }
            }
            var setPos = function (x, y) {
                x = Math.round(Math.max(0, Math.min(width, x)));
                y = Math.round(Math.max(0, Math.min(height, y)));
                crossX.style.top = y + 'px';
                crossY.style.left = x + 'px';
                x = Math.round(Math.max(0, Math.min(_this.params.screenWidth, x / width * _this.params.screenWidth)));
                y = Math.round(Math.max(0, Math.min(_this.params.screenHeight, y / height * _this.params.screenHeight)));
                label.textContent = _this.params.xInputName + "=" + x + " " + _this.params.yInputName + "=" + y;
                // Position the label so that it doesn't go outside the screen bounds
                var bb = label.getBoundingClientRect();
                if (x > _this.params.screenWidth / 2) {
                    label.style.left = (x * (width / _this.params.screenWidth) - bb.width - 8) + 'px';
                }
                else {
                    label.style.left = (x * (width / _this.params.screenWidth) + 4) + 'px';
                }
                if (y > _this.params.screenHeight / 2) {
                    label.style.top = (y * (height / _this.params.screenHeight) - bb.height - 6) + "px";
                }
                else {
                    label.style.top = (y * (height / _this.params.screenHeight)) + 'px';
                }
            };
            // Position initial crossX and crossY
            this.resetCrosshair = function () {
                var _a = _this.getXY(), currentX = _a.currentX, currentY = _a.currentY;
                setPos(currentX / _this.params.screenWidth * width, currentY / _this.params.screenHeight * height);
            };
            this.resetCrosshair();
            Blockly.bindEvent_(this.selectorDiv_, 'mousemove', this, function (e) {
                var bb = canvasOverlayDiv.getBoundingClientRect();
                var x = e.clientX - bb.left;
                var y = e.clientY - bb.top;
                setPos(x, y);
            });
            Blockly.bindEvent_(this.selectorDiv_, 'mouseleave', this, this.resetCrosshair);
            Blockly.bindEvent_(this.selectorDiv_, 'click', this, function (e) {
                var bb = canvasOverlayDiv.getBoundingClientRect();
                var x = e.clientX - bb.left;
                var y = e.clientY - bb.top;
                var normalizedX = Math.round(x / width * _this.params.screenWidth);
                var normalizedY = Math.round(y / height * _this.params.screenHeight);
                _this.close();
                _this.setXY(normalizedX, normalizedY);
            });
        };
        FieldPosition.prototype.resizeHandler = function () {
            this.close();
        };
        FieldPosition.prototype.setXY = function (x, y) {
            var xField = this.getFieldByName(this.params.xInputName);
            if (xField && typeof xField.getValue() == "number") {
                xField.setValue(String(x));
            }
            var yField = this.getFieldByName(this.params.yInputName);
            if (yField && typeof yField.getValue() == "number") {
                yField.setValue(String(y));
            }
        };
        FieldPosition.prototype.getFieldByName = function (name) {
            var parentBlock = this.sourceBlock_.parentBlock_;
            if (!parentBlock)
                return undefined; // warn
            for (var i = 0; i < parentBlock.inputList.length; i++) {
                var input = parentBlock.inputList[i];
                if (input.name === name) {
                    return this.getTargetField(input);
                }
            }
            return undefined;
        };
        FieldPosition.prototype.getXY = function () {
            var currentX;
            var currentY;
            var xField = this.getFieldByName(this.params.xInputName);
            if (xField)
                currentX = xField.getValue();
            var yField = this.getFieldByName(this.params.yInputName);
            if (yField)
                currentY = yField.getValue();
            return { currentX: parseInt(currentX), currentY: parseInt(currentY) };
        };
        FieldPosition.prototype.getTargetField = function (input) {
            var targetBlock = input.connection.targetBlock();
            if (!targetBlock)
                return null;
            var targetInput = targetBlock.inputList[0];
            if (!targetInput)
                return null;
            var targetField = targetInput.fieldRow[0];
            return targetField;
        };
        FieldPosition.prototype.widgetDispose_ = function () {
            var that = this;
            Blockly.FieldNumber.superClass_.widgetDispose_.call(that);
            that.close(true);
        };
        FieldPosition.prototype.close = function (skipWidget) {
            if (!skipWidget) {
                Blockly.WidgetDiv.hideIfOwner(this);
                Blockly.DropDownDiv.hideIfOwner(this);
            }
            // remove resize listener
            window.removeEventListener("resize", this.resizeHandler);
            this.resetCrosshair = undefined;
            // Destroy the selector div
            if (!this.selectorDiv_)
                return;
            goog.dom.removeNode(this.selectorDiv_);
            this.selectorDiv_ = undefined;
        };
        return FieldPosition;
    }(Blockly.FieldSlider));
    pxtblockly.FieldPosition = FieldPosition;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldProcedure = /** @class */ (function (_super) {
        __extends(FieldProcedure, _super);
        function FieldProcedure(funcname, opt_validator) {
            var _this = _super.call(this, [["Temp", "Temp"]], opt_validator) || this;
            _this.setValue(funcname || '');
            return _this;
        }
        FieldProcedure.prototype.getOptions = function () {
            return this.dropdownCreate();
        };
        ;
        FieldProcedure.prototype.init = function () {
            if (this.fieldGroup_) {
                // Dropdown has already been initialized once.
                return;
            }
            _super.prototype.init.call(this);
        };
        ;
        FieldProcedure.prototype.setSourceBlock = function (block) {
            goog.asserts.assert(!block.isShadow(), 'Procedure fields are not allowed to exist on shadow blocks.');
            _super.prototype.setSourceBlock.call(this, block);
        };
        ;
        /**
         * Return a sorted list of variable names for procedure dropdown menus.
         * Include a special option at the end for creating a new function name.
         * @return {!Array.<string>} Array of procedure names.
         * @this {pxtblockly.FieldProcedure}
         */
        FieldProcedure.prototype.dropdownCreate = function () {
            var functionList = [];
            if (this.sourceBlock_ && this.sourceBlock_.workspace) {
                var blocks = this.sourceBlock_.workspace.getAllBlocks();
                // Iterate through every block and check the name.
                for (var i = 0; i < blocks.length; i++) {
                    if (blocks[i].getProcedureDef) {
                        var procName = blocks[i].getProcedureDef();
                        functionList.push(procName[0]);
                    }
                }
            }
            // Ensure that the currently selected variable is an option.
            var name = this.getValue();
            if (name && functionList.indexOf(name) == -1) {
                functionList.push(name);
            }
            functionList.sort(goog.string.caseInsensitiveCompare);
            if (!functionList.length) {
                // Add temporary list item so the dropdown doesn't break
                functionList.push("Temp");
            }
            // Variables are not language-specific, use the name as both the user-facing
            // text and the internal representation.
            var options = [];
            for (var i = 0; i < functionList.length; i++) {
                options[i] = [functionList[i], functionList[i]];
            }
            return options;
        };
        FieldProcedure.prototype.onItemSelected = function (menu, menuItem) {
            var itemText = menuItem.getValue();
            if (this.sourceBlock_) {
                // Call any validation function, and allow it to override.
                itemText = this.callValidator(itemText);
            }
            if (itemText !== null) {
                this.setValue(itemText);
            }
        };
        return FieldProcedure;
    }(Blockly.FieldDropdown));
    pxtblockly.FieldProcedure = FieldProcedure;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts"/>
/// <reference path="../../built/pxtsim.d.ts"/>
var pxtblockly;
(function (pxtblockly) {
    var FieldProtractor = /** @class */ (function (_super) {
        __extends(FieldProtractor, _super);
        /**
         * Class for a color wheel field.
         * @param {number|string} value The initial content of the field.
         * @param {Function=} opt_validator An optional function that is called
         *     to validate any constraints on what the user entered.  Takes the new
         *     text as an argument and returns either the accepted text, a replacement
         *     text, or null to abort the change.
         * @extends {Blockly.FieldNumber}
         * @constructor
         */
        function FieldProtractor(value_, params, opt_validator) {
            var _this = _super.call(this, String(value_), '0', '180', '1', '15', lf("Angle"), opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.params = params;
            return _this;
        }
        FieldProtractor.prototype.createLabelDom_ = function (labelText) {
            var labelContainer = document.createElement('div');
            this.circleSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            pxsim.svg.hydrate(this.circleSVG, {
                viewBox: "0 0 200 100",
                width: "170"
            });
            labelContainer.appendChild(this.circleSVG);
            var outerCircle = pxsim.svg.child(this.circleSVG, "circle", {
                'stroke-dasharray': '565.48', 'stroke-dashoffset': '0',
                'cx': 100, 'cy': 100, 'r': '90', 'style': "fill:transparent; transition: stroke-dashoffset 0.1s linear;",
                'stroke': '#a8aaa8', 'stroke-width': '1rem'
            });
            this.circleBar = pxsim.svg.child(this.circleSVG, "circle", {
                'stroke-dasharray': '565.48', 'stroke-dashoffset': '0',
                'cx': 100, 'cy': 100, 'r': '90', 'style': "fill:transparent; transition: stroke-dashoffset 0.1s linear;",
                'stroke': '#f12a21', 'stroke-width': '1rem'
            });
            this.reporter = pxsim.svg.child(this.circleSVG, "text", {
                'x': 100, 'y': 80,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'style': 'font-size: 50px',
                'class': 'sim-text inverted number'
            });
            // labelContainer.setAttribute('class', 'blocklyFieldSliderLabel');
            var readout = document.createElement('span');
            readout.setAttribute('class', 'blocklyFieldSliderReadout');
            return [labelContainer, readout];
        };
        ;
        FieldProtractor.prototype.setReadout_ = function (readout, value) {
            this.updateAngle(parseFloat(value));
            // Update reporter
            this.reporter.textContent = value + "\u00B0";
        };
        FieldProtractor.prototype.updateAngle = function (angle) {
            angle = Math.max(0, Math.min(180, angle));
            var radius = 90;
            var pct = (180 - angle) / 180 * Math.PI * radius;
            this.circleBar.setAttribute('stroke-dashoffset', "" + pct);
        };
        return FieldProtractor;
    }(Blockly.FieldSlider));
    pxtblockly.FieldProtractor = FieldProtractor;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts"/>
/// <reference path="../../built/pxtsim.d.ts"/>
var pxtblockly;
(function (pxtblockly) {
    var FieldSpeed = /** @class */ (function (_super) {
        __extends(FieldSpeed, _super);
        /**
         * Class for a color wheel field.
         * @param {number|string} value The initial content of the field.
         * @param {Function=} opt_validator An optional function that is called
         *     to validate any constraints on what the user entered.  Takes the new
         *     text as an argument and returns either the accepted text, a replacement
         *     text, or null to abort the change.
         * @extends {Blockly.FieldNumber}
         * @constructor
         */
        function FieldSpeed(value_, params, opt_validator) {
            var _this = _super.call(this, String(value_), '-100', '100', '1', '10', 'Speed', opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.params = params;
            if (_this.params['min'])
                _this.min_ = parseFloat(_this.params.min);
            if (_this.params['max'])
                _this.max_ = parseFloat(_this.params.max);
            if (_this.params['label'])
                _this.labelText_ = _this.params.label;
            if (!_this.params.format)
                _this.params.format = "{0}%";
            return _this;
        }
        FieldSpeed.prototype.createLabelDom_ = function (labelText) {
            var labelContainer = document.createElement('div');
            this.speedSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            pxsim.svg.hydrate(this.speedSVG, {
                viewBox: "0 0 200 100",
                width: "170"
            });
            labelContainer.appendChild(this.speedSVG);
            var outerCircle = pxsim.svg.child(this.speedSVG, "circle", {
                'stroke-dasharray': '565.48', 'stroke-dashoffset': '0',
                'cx': 100, 'cy': 100, 'r': '90', 'style': "fill:transparent; transition: stroke-dashoffset 0.1s linear;",
                'stroke': '#a8aaa8', 'stroke-width': '1rem'
            });
            this.circleBar = pxsim.svg.child(this.speedSVG, "circle", {
                'stroke-dasharray': '565.48', 'stroke-dashoffset': '0',
                'cx': 100, 'cy': 100, 'r': '90', 'style': "fill:transparent; transition: stroke-dashoffset 0.1s linear;",
                'stroke': '#f12a21', 'stroke-width': '1rem'
            });
            this.reporter = pxsim.svg.child(this.speedSVG, "text", {
                'x': 100, 'y': 80,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'style': "font-size: " + Math.max(14, 50 - 5 * (this.params.format.length - 4)) + "px",
                'class': 'sim-text inverted number'
            });
            // labelContainer.setAttribute('class', 'blocklyFieldSliderLabel');
            var readout = document.createElement('span');
            readout.setAttribute('class', 'blocklyFieldSliderReadout');
            // var label = document.createElement('span');
            // label.setAttribute('class', 'blocklyFieldSliderLabelText');
            // label.innerHTML = labelText;
            // labelContainer.appendChild(label);
            // labelContainer.appendChild(readout);
            return [labelContainer, readout];
        };
        ;
        FieldSpeed.prototype.setReadout_ = function (readout, value) {
            this.updateSpeed(parseFloat(value));
            // Update reporter
            this.reporter.textContent = ts.pxtc.U.rlf(this.params.format, value);
        };
        FieldSpeed.prototype.updateSpeed = function (speed) {
            var sign = this.sign(speed);
            speed = (Math.abs(speed) / 100 * 50) + 50;
            if (sign == -1)
                speed = 50 - speed;
            var c = Math.PI * (90 * 2);
            var pct = ((100 - speed) / 100) * c;
            this.circleBar.setAttribute('stroke-dashoffset', "" + pct);
        };
        // A re-implementation of Math.sign (since IE11 doesn't support it)
        FieldSpeed.prototype.sign = function (num) {
            return num ? num < 0 ? -1 : 1 : 0;
        };
        return FieldSpeed;
    }(Blockly.FieldSlider));
    pxtblockly.FieldSpeed = FieldSpeed;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../built/pxtlib.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var svg = pxt.svgUtil;
    // 32 is specifically chosen so that we can scale the images for the default
    // sprite sizes without getting browser anti-aliasing
    var PREVIEW_WIDTH = 32;
    var X_PADDING = 5;
    var Y_PADDING = 1;
    var BG_PADDING = 4;
    var BG_WIDTH = BG_PADDING * 2 + PREVIEW_WIDTH;
    var TOTAL_HEIGHT = Y_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH;
    var TOTAL_WIDTH = X_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH;
    var FieldSpriteEditor = /** @class */ (function (_super) {
        __extends(FieldSpriteEditor, _super);
        function FieldSpriteEditor(text, params, validator) {
            var _this = _super.call(this, text, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.lightMode = params.lightMode;
            _this.params = parseFieldOptions(params);
            _this.blocksInfo = params.blocksInfo;
            if (!_this.state) {
                _this.state = new pxt.sprite.Bitmap(_this.params.initWidth, _this.params.initHeight);
            }
            return _this;
        }
        FieldSpriteEditor.prototype.init = function () {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
            if (!this.visible_) {
                this.fieldGroup_.style.display = 'none';
            }
            if (!this.state) {
                this.state = new pxt.sprite.Bitmap(this.params.initWidth, this.params.initHeight);
            }
            this.redrawPreview();
            this.updateEditable();
            this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
            // Force a render.
            this.render_();
            this.mouseDownWrapper_ = Blockly.bindEventWithChecks_(this.getClickTarget_(), "mousedown", this, this.onMouseDown_);
        };
        FieldSpriteEditor.prototype.showEditor_ = function () {
            var _this = this;
            this.params.blocksInfo = this.blocksInfo;
            var fv = pxt.react.getFieldEditorView("image-editor", this.state, this.params);
            if (this.undoRedoState) {
                fv.restorePersistentData(this.undoRedoState);
            }
            fv.onHide(function () {
                var result = fv.getResult();
                if (result) {
                    var old = _this.getValue();
                    _this.state = result;
                    _this.redrawPreview();
                    _this.undoRedoState = fv.getPersistentData();
                    if (_this.sourceBlock_ && Blockly.Events.isEnabled()) {
                        Blockly.Events.fire(new Blockly.Events.BlockChange(_this.sourceBlock_, 'field', _this.name, old, _this.getValue()));
                    }
                }
            });
            fv.show();
        };
        FieldSpriteEditor.prototype.render_ = function () {
            _super.prototype.render_.call(this);
            this.size_.height = TOTAL_HEIGHT;
            this.size_.width = TOTAL_WIDTH;
        };
        FieldSpriteEditor.prototype.getValue = function () {
            return pxt.sprite.bitmapToImageLiteral(this.state, "typescript" /* TypeScript */);
        };
        FieldSpriteEditor.prototype.doValueUpdate_ = function (newValue) {
            if (newValue == null) {
                return;
            }
            this.value_ = newValue;
            this.parseBitmap(newValue);
            this.redrawPreview();
            _super.prototype.doValueUpdate_.call(this, newValue);
        };
        FieldSpriteEditor.prototype.redrawPreview = function () {
            if (!this.fieldGroup_)
                return;
            pxsim.U.clear(this.fieldGroup_);
            var bg = new svg.Rect()
                .at(X_PADDING, Y_PADDING)
                .size(BG_WIDTH, BG_WIDTH)
                .setClass("blocklySpriteField")
                .stroke("#898989", 1)
                .corner(4);
            this.fieldGroup_.appendChild(bg.el);
            if (this.state) {
                var data = pxtblockly.bitmapToImageURI(this.state, PREVIEW_WIDTH, this.lightMode);
                var img = new svg.Image()
                    .src(data)
                    .at(X_PADDING + BG_PADDING, Y_PADDING + BG_PADDING)
                    .size(PREVIEW_WIDTH, PREVIEW_WIDTH);
                this.fieldGroup_.appendChild(img.el);
            }
        };
        FieldSpriteEditor.prototype.parseBitmap = function (newText) {
            var bmp = pxt.sprite.imageLiteralToBitmap(newText);
            // Ignore invalid bitmaps
            if (bmp && bmp.width && bmp.height) {
                this.state = bmp;
            }
        };
        return FieldSpriteEditor;
    }(Blockly.Field));
    pxtblockly.FieldSpriteEditor = FieldSpriteEditor;
    function parseFieldOptions(opts) {
        // NOTE: This implementation is duplicated in pxtcompiler/emitter/service.ts
        // TODO: Refactor to share implementation.
        var parsed = {
            initColor: 1,
            initWidth: 16,
            initHeight: 16,
            disableResize: false,
        };
        if (!opts) {
            return parsed;
        }
        if (opts.sizes) {
            var pairs = opts.sizes.split(";");
            var sizes = [];
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].split(",");
                if (pair.length !== 2) {
                    continue;
                }
                var width = parseInt(pair[0]);
                var height = parseInt(pair[1]);
                if (isNaN(width) || isNaN(height)) {
                    continue;
                }
                var screenSize = pxt.appTarget.runtime && pxt.appTarget.runtime.screenSize;
                if (width < 0 && screenSize)
                    width = screenSize.width;
                if (height < 0 && screenSize)
                    height = screenSize.height;
                sizes.push([width, height]);
            }
            if (sizes.length > 0) {
                parsed.initWidth = sizes[0][0];
                parsed.initHeight = sizes[0][1];
            }
        }
        if (opts.filter) {
            parsed.filter = opts.filter;
        }
        if (opts.disableResize) {
            parsed.disableResize = opts.disableResize.toLowerCase() === "true" || opts.disableResize === "1";
        }
        parsed.initColor = withDefault(opts.initColor, parsed.initColor);
        parsed.initWidth = withDefault(opts.initWidth, parsed.initWidth);
        parsed.initHeight = withDefault(opts.initHeight, parsed.initHeight);
        return parsed;
        function withDefault(raw, def) {
            var res = parseInt(raw);
            if (isNaN(res)) {
                return def;
            }
            return res;
        }
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldStyledLabel = /** @class */ (function (_super) {
        __extends(FieldStyledLabel, _super);
        function FieldStyledLabel(value, options, opt_validator) {
            var _this = _super.call(this, value, getClass(options)) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        return FieldStyledLabel;
    }(Blockly.FieldLabel));
    pxtblockly.FieldStyledLabel = FieldStyledLabel;
    function getClass(options) {
        if (options) {
            if (options.bold && options.italics) {
                return 'blocklyBoldItalicizedText';
            }
            else if (options.bold) {
                return 'blocklyBoldText';
            }
            else if (options.italics) {
                return 'blocklyItalicizedText';
            }
        }
        return undefined;
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldTextDropdown = /** @class */ (function (_super) {
        __extends(FieldTextDropdown, _super);
        function FieldTextDropdown(text, options, opt_validator) {
            var _this = _super.call(this, text, options.values, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        return FieldTextDropdown;
    }(Blockly.FieldTextDropdown));
    pxtblockly.FieldTextDropdown = FieldTextDropdown;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/pxtblockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldTextInput = /** @class */ (function (_super) {
        __extends(FieldTextInput, _super);
        function FieldTextInput(value, options, opt_validator) {
            var _this = _super.call(this, value, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        return FieldTextInput;
    }(Blockly.FieldTextInput));
    pxtblockly.FieldTextInput = FieldTextInput;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../built/pxtlib.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var svg = pxt.svgUtil;
    // 32 is specifically chosen so that we can scale the images for the default
    // sprite sizes without getting browser anti-aliasing
    var PREVIEW_WIDTH = 32;
    var X_PADDING = 5;
    var Y_PADDING = 1;
    var BG_PADDING = 4;
    var BG_WIDTH = BG_PADDING * 2 + PREVIEW_WIDTH;
    var TOTAL_HEIGHT = Y_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH;
    var TOTAL_WIDTH = X_PADDING * 2 + BG_PADDING * 2 + PREVIEW_WIDTH;
    var FieldTilemap = /** @class */ (function (_super) {
        __extends(FieldTilemap, _super);
        function FieldTilemap(text, params, validator) {
            var _this = _super.call(this, text, validator) || this;
            _this.isFieldCustom_ = true;
            _this.SERIALIZABLE = true;
            _this.lightMode = params.lightMode;
            _this.params = parseFieldOptions(params);
            _this.blocksInfo = params.blocksInfo;
            // Update now that we have blocksinfo
            if (text && !_this.state)
                _this.doValueUpdate_(text);
            _this.initState();
            return _this;
        }
        FieldTilemap.prototype.init = function () {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
            if (!this.visible_) {
                this.fieldGroup_.style.display = 'none';
            }
            this.initState();
            this.redrawPreview();
            this.updateEditable();
            this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
            // Force a render.
            this.render_();
            this.mouseDownWrapper_ = Blockly.bindEventWithChecks_(this.getClickTarget_(), "mousedown", this, this.onMouseDown_);
        };
        FieldTilemap.prototype.showEditor_ = function () {
            var _this = this;
            if (this.isGreyBlock)
                return;
            this.params.blocksInfo = this.blocksInfo;
            this.state.projectReferences = pxtblockly.getAllReferencedTiles(this.sourceBlock_.workspace, this.sourceBlock_.id).map(function (t) { return t.id; });
            var project = pxt.react.getTilemapProject();
            var allTiles = project.getProjectTiles(this.state.tileset.tileWidth, true);
            var _loop_4 = function (tile) {
                if (!this_3.state.tileset.tiles.some(function (t) { return t.id === tile.id; })) {
                    this_3.state.tileset.tiles.push(tile);
                }
            };
            var this_3 = this;
            for (var _i = 0, _a = allTiles.tiles; _i < _a.length; _i++) {
                var tile = _a[_i];
                _loop_4(tile);
            }
            var _loop_5 = function (tile) {
                tile.weight = allTiles.tiles.findIndex(function (t) { return t.id === tile.id; });
            };
            for (var _b = 0, _c = this.state.tileset.tiles; _b < _c.length; _b++) {
                var tile = _c[_b];
                _loop_5(tile);
            }
            var fv = pxt.react.getFieldEditorView("tilemap-editor", this.state, this.params);
            if (this.undoRedoState) {
                fv.restorePersistentData(this.undoRedoState);
            }
            fv.onHide(function () {
                var result = fv.getResult();
                if (result) {
                    var old = _this.getValue();
                    _this.state = result;
                    _this.state.projectReferences = null;
                    var lastRevision = project.revision();
                    project.pushUndo();
                    if (result.deletedTiles) {
                        for (var _i = 0, _a = result.deletedTiles; _i < _a.length; _i++) {
                            var deleted = _a[_i];
                            project.deleteTile(deleted);
                        }
                    }
                    if (result.editedTiles) {
                        var _loop_6 = function (edit) {
                            var editedIndex = result.tileset.tiles.findIndex(function (t) { return t.id === edit; });
                            var edited = result.tileset.tiles[editedIndex];
                            // New tiles start with *. We haven't created them yet so ignore
                            if (!edited || edited.id.startsWith("*"))
                                return "continue";
                            result.tileset.tiles[editedIndex] = project.updateTile(edited.id, edited.bitmap);
                        };
                        for (var _b = 0, _c = result.editedTiles; _b < _c.length; _b++) {
                            var edit = _c[_b];
                            _loop_6(edit);
                        }
                    }
                    for (var i = 0; i < result.tileset.tiles.length; i++) {
                        var tile = result.tileset.tiles[i];
                        if (tile.id.startsWith("*")) {
                            var newTile = project.createNewTile(tile.bitmap);
                            result.tileset.tiles[i] = newTile;
                        }
                        else if (!tile.data) {
                            result.tileset.tiles[i] = project.resolveTile(tile.id);
                        }
                    }
                    pxt.sprite.trimTilemapTileset(result);
                    if (_this.tilemapId) {
                        project.updateTilemap(_this.tilemapId, result);
                    }
                    _this.redrawPreview();
                    _this.undoRedoState = fv.getPersistentData();
                    var newValue = _this.getValue();
                    if (old !== newValue) {
                        project.forceUpdate();
                    }
                    if (_this.sourceBlock_ && Blockly.Events.isEnabled()) {
                        Blockly.Events.fire(new BlocklyTilemapChange(_this.sourceBlock_, 'field', _this.name, old, _this.getValue(), lastRevision, project.revision()));
                    }
                }
            });
            fv.show();
        };
        FieldTilemap.prototype.render_ = function () {
            _super.prototype.render_.call(this);
            if (!this.isGreyBlock) {
                this.size_.height = TOTAL_HEIGHT;
                this.size_.width = TOTAL_WIDTH;
            }
        };
        FieldTilemap.prototype.getValue = function () {
            if (this.isGreyBlock)
                return pxt.Util.htmlUnescape(this.value_);
            if (this.tilemapId) {
                return "tilemap`" + this.tilemapId + "`";
            }
            try {
                return pxt.sprite.encodeTilemap(this.state, "typescript");
            }
            catch (e) {
                // If encoding failed, this is a legacy tilemap. Should get upgraded when the project is loaded
                return this.getInitText();
            }
        };
        FieldTilemap.prototype.getTileset = function () {
            return this.state.tileset;
        };
        FieldTilemap.prototype.getInitText = function () {
            return this.initText;
        };
        FieldTilemap.prototype.doValueUpdate_ = function (newValue) {
            if (newValue == null) {
                return;
            }
            this.value_ = newValue;
            this.parseBitmap(newValue);
            this.redrawPreview();
            _super.prototype.doValueUpdate_.call(this, newValue);
        };
        FieldTilemap.prototype.redrawPreview = function () {
            if (!this.fieldGroup_)
                return;
            pxsim.U.clear(this.fieldGroup_);
            if (this.isGreyBlock) {
                this.createTextElement_();
                this.updateEditable();
                return;
            }
            var bg = new svg.Rect()
                .at(X_PADDING, Y_PADDING)
                .size(BG_WIDTH, BG_WIDTH)
                .setClass("blocklyTilemapField")
                .corner(4);
            this.fieldGroup_.appendChild(bg.el);
            if (this.state) {
                var data = pxtblockly.tilemapToImageURI(this.state, PREVIEW_WIDTH, this.lightMode, this.blocksInfo);
                var img = new svg.Image()
                    .src(data)
                    .at(X_PADDING + BG_PADDING, Y_PADDING + BG_PADDING)
                    .size(PREVIEW_WIDTH, PREVIEW_WIDTH);
                this.fieldGroup_.appendChild(img.el);
            }
        };
        FieldTilemap.prototype.refreshTileset = function () {
            var project = pxt.react.getTilemapProject();
            if (this.tilemapId) {
                this.state = project.getTilemap(this.tilemapId);
            }
            else if (this.state) {
                for (var i = 0; i < this.state.tileset.tiles.length; i++) {
                    this.state.tileset.tiles[i] = project.resolveTile(this.state.tileset.tiles[i].id);
                }
            }
        };
        FieldTilemap.prototype.parseBitmap = function (newText) {
            if (!this.blocksInfo)
                return;
            if (newText) {
                // backticks are escaped inside markdown content
                newText = newText.replace(/&#96;/g, "`");
            }
            var match = /^\s*tilemap\s*`([^`]*)`\s*$/.exec(newText);
            if (match) {
                var tilemapId = match[1].trim();
                this.state = pxt.react.getTilemapProject().getTilemap(tilemapId);
                if (this.state) {
                    this.tilemapId = tilemapId;
                    return;
                }
            }
            var tilemap = pxt.sprite.decodeTilemap(newText, "typescript", pxt.react.getTilemapProject()) || emptyTilemap(this.params.tileWidth, this.params.initWidth, this.params.initHeight);
            // Ignore invalid bitmaps
            if (checkTilemap(tilemap)) {
                this.initText = newText;
                this.state = tilemap;
                this.isGreyBlock = false;
            }
            else if (newText.trim()) {
                this.isGreyBlock = true;
                this.value_ = newText;
            }
        };
        FieldTilemap.prototype.initState = function () {
            if (!this.state) {
                this.state = pxt.react.getTilemapProject().blankTilemap(this.params.tileWidth, this.params.initWidth, this.params.initHeight);
            }
        };
        FieldTilemap.prototype.getDisplayText_ = function () {
            var text = pxt.Util.htmlUnescape(this.value_);
            return text.substr(0, text.indexOf("(")) + "(...)";
            ;
        };
        FieldTilemap.prototype.updateEditable = function () {
            if (this.isGreyBlock && this.fieldGroup_) {
                var group = this.fieldGroup_;
                Blockly.utils.dom.removeClass(group, 'blocklyNonEditableText');
                Blockly.utils.dom.removeClass(group, 'blocklyEditableText');
                group.style.cursor = '';
            }
            else {
                _super.prototype.updateEditable.call(this);
            }
        };
        return FieldTilemap;
    }(Blockly.Field));
    pxtblockly.FieldTilemap = FieldTilemap;
    function parseFieldOptions(opts) {
        var parsed = {
            initWidth: 16,
            initHeight: 16,
            tileWidth: 16
        };
        if (!opts) {
            return parsed;
        }
        if (opts.filter) {
            parsed.filter = opts.filter;
        }
        if (opts.tileWidth) {
            if (typeof opts.tileWidth === "number") {
                switch (opts.tileWidth) {
                    case 8:
                        parsed.tileWidth = 8;
                        break;
                    case 16:
                        parsed.tileWidth = 16;
                        break;
                    case 32:
                        parsed.tileWidth = 32;
                        break;
                }
            }
            else {
                var tw = opts.tileWidth.trim().toLowerCase();
                switch (tw) {
                    case "8":
                    case "eight":
                        parsed.tileWidth = 8;
                        break;
                    case "16":
                    case "sixteen":
                        parsed.tileWidth = 16;
                        break;
                    case "32":
                    case "thirtytwo":
                        parsed.tileWidth = 32;
                        break;
                }
            }
        }
        parsed.initWidth = withDefault(opts.initWidth, parsed.initWidth);
        parsed.initHeight = withDefault(opts.initHeight, parsed.initHeight);
        return parsed;
        function withDefault(raw, def) {
            var res = parseInt(raw);
            if (isNaN(res)) {
                return def;
            }
            return res;
        }
    }
    function checkTilemap(tilemap) {
        if (!tilemap || !tilemap.tilemap || !tilemap.tilemap.width || !tilemap.tilemap.height)
            return false;
        if (!tilemap.layers || tilemap.layers.width !== tilemap.tilemap.width || tilemap.layers.height !== tilemap.tilemap.height)
            return false;
        if (!tilemap.tileset)
            return false;
        return true;
    }
    var BlocklyTilemapChange = /** @class */ (function (_super) {
        __extends(BlocklyTilemapChange, _super);
        function BlocklyTilemapChange(block, element, name, oldValue, newValue, oldRevision, newRevision) {
            var _this = _super.call(this, block, element, name, oldValue, newValue) || this;
            _this.oldRevision = oldRevision;
            _this.newRevision = newRevision;
            return _this;
        }
        BlocklyTilemapChange.prototype.isNull = function () {
            return this.oldRevision === this.newRevision && _super.prototype.isNull.call(this);
        };
        BlocklyTilemapChange.prototype.run = function (forward) {
            if (forward) {
                pxt.react.getTilemapProject().redo();
                _super.prototype.run.call(this, forward);
            }
            else {
                pxt.react.getTilemapProject().undo();
                _super.prototype.run.call(this, forward);
            }
            var ws = this.getEventWorkspace_();
            var tilemaps = pxtblockly.getAllBlocksWithTilemaps(ws);
            for (var _i = 0, tilemaps_1 = tilemaps; _i < tilemaps_1.length; _i++) {
                var t = tilemaps_1[_i];
                t.ref.refreshTileset();
                t.ref.redrawPreview();
            }
            // Fire an event to force a recompile, but make sure it doesn't end up on the undo stack
            var ev = new BlocklyTilemapChange(ws.getBlockById(this.blockId), 'tilemap-revision', "revision", null, pxt.react.getTilemapProject().revision(), 0, 0);
            ev.recordUndo = false;
            Blockly.Events.fire(ev);
        };
        return BlocklyTilemapChange;
    }(Blockly.Events.BlockChange));
    function emptyTilemap(tileWidth, width, height) {
        return new pxt.sprite.TilemapData(new pxt.sprite.Tilemap(width, height), { tileWidth: tileWidth, tiles: [] }, new pxt.sprite.Bitmap(width, height).data());
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../built/pxtlib.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var PREVIEW_SIDE_LENGTH = 32;
    var FieldTileset = /** @class */ (function (_super) {
        __extends(FieldTileset, _super);
        function FieldTileset(text, options, validator) {
            var _this = _super.call(this, text, options, validator) || this;
            _this.isFieldCustom_ = true;
            _this.menuGenerator_ = function () {
                var _a, _b;
                if (((_a = _this.sourceBlock_) === null || _a === void 0 ? void 0 : _a.workspace) && pxtblockly.needsTilemapUpgrade((_b = _this.sourceBlock_) === null || _b === void 0 ? void 0 : _b.workspace)) {
                    return [[{
                                src: mkTransparentTileImage(16),
                                width: PREVIEW_SIDE_LENGTH,
                                height: PREVIEW_SIDE_LENGTH,
                                alt: _this.getValue()
                            }, _this.getValue()]];
                }
                return FieldTileset.getReferencedTiles(_this.sourceBlock_.workspace);
            };
            _this.blocksInfo = options.blocksInfo;
            return _this;
        }
        FieldTileset.getReferencedTiles = function (workspace) {
            var project = pxt.react.getTilemapProject();
            if (project.revision() !== FieldTileset.cachedRevision || workspace.id != FieldTileset.cachedWorkspaceId) {
                FieldTileset.cachedRevision = project.revision();
                FieldTileset.cachedWorkspaceId = workspace.id;
                var references = pxtblockly.getAllReferencedTiles(workspace);
                var supportedTileWidths = [16, 8, 32];
                for (var _i = 0, supportedTileWidths_1 = supportedTileWidths; _i < supportedTileWidths_1.length; _i++) {
                    var width = supportedTileWidths_1[_i];
                    var projectTiles = project.getProjectTiles(width, width === 16);
                    if (!projectTiles)
                        continue;
                    var _loop_7 = function (tile) {
                        if (!references.find(function (t) { return t.id === tile.id; })) {
                            references.push(tile);
                        }
                    };
                    for (var _a = 0, _b = projectTiles.tiles; _a < _b.length; _a++) {
                        var tile = _b[_a];
                        _loop_7(tile);
                    }
                }
                var weights_1 = {};
                references.sort(function (a, b) {
                    if (a.id === b.id)
                        return 0;
                    if (a.bitmap.width !== b.bitmap.width) {
                        return a.bitmap.width - b.bitmap.width;
                    }
                    if (a.isProjectTile !== b.isProjectTile) {
                        if (a.isProjectTile)
                            return -1;
                        else
                            return 1;
                    }
                    return (weights_1[a.id] || (weights_1[a.id] = tileWeight(a.id))) -
                        (weights_1[b.id] || (weights_1[b.id] = tileWeight(b.id)));
                });
                var getTileImage_1 = function (t) { return tileWeight(t.id) <= 2 ?
                    mkTransparentTileImage(t.bitmap.width) :
                    pxtblockly.bitmapToImageURI(pxt.sprite.Bitmap.fromData(t.bitmap), PREVIEW_SIDE_LENGTH, false); };
                FieldTileset.referencedTiles = references.map(function (tile) { return [{
                        src: getTileImage_1(tile),
                        width: PREVIEW_SIDE_LENGTH,
                        height: PREVIEW_SIDE_LENGTH,
                        alt: tile.id
                    }, tile.id]; });
            }
            return FieldTileset.referencedTiles;
        };
        FieldTileset.prototype.init = function () {
            _super.prototype.init.call(this);
            if (this.sourceBlock_ && this.sourceBlock_.isInFlyout) {
                this.setValue(this.getOptions()[0][1]);
            }
        };
        FieldTileset.prototype.getValue = function () {
            var v = _super.prototype.getValue.call(this);
            // If the user decompiled from JavaScript, then they might have passed an image literal
            // instead of the qualified name of a tile. The decompiler strips out the "img" part
            // so we need to add it back
            if (typeof v === "string" && v.indexOf(".") === -1 && v.indexOf("`") === -1) {
                return "img`" + v + "`";
            }
            return v;
        };
        FieldTileset.prototype.getText = function () {
            var v = this.getValue();
            if (typeof v === "string" && v.indexOf("`") !== -1) {
                return v;
            }
            return _super.prototype.getText.call(this);
        };
        FieldTileset.prototype.render_ = function () {
            if (this.value_ && this.selectedOption_) {
                if (this.selectedOption_[1] !== this.value_) {
                    var tile = pxt.react.getTilemapProject().resolveTile(this.value_);
                    FieldTileset.cachedRevision = -1;
                    if (tile) {
                        this.selectedOption_ = [{
                                src: pxtblockly.bitmapToImageURI(pxt.sprite.Bitmap.fromData(tile.bitmap), PREVIEW_SIDE_LENGTH, false),
                                width: PREVIEW_SIDE_LENGTH,
                                height: PREVIEW_SIDE_LENGTH,
                                alt: tile.id
                            }, this.value_];
                    }
                }
            }
            _super.prototype.render_.call(this);
        };
        FieldTileset.prototype.getOptions = function () {
            if (typeof this.menuGenerator_ !== 'function') {
                this.transparent = constructTransparentTile();
                return [this.transparent];
            }
            return this.menuGenerator_.call(this);
        };
        return FieldTileset;
    }(pxtblockly.FieldImages));
    pxtblockly.FieldTileset = FieldTileset;
    function constructTransparentTile() {
        var tile = pxt.react.getTilemapProject().getTransparency(16);
        return [{
                src: mkTransparentTileImage(16),
                width: PREVIEW_SIDE_LENGTH,
                height: PREVIEW_SIDE_LENGTH,
                alt: pxt.U.lf("transparency")
            }, tile.id];
    }
    function mkTransparentTileImage(sideLength) {
        var canvas = document.createElement("canvas");
        var context = canvas.getContext("2d");
        canvas.width = sideLength;
        canvas.height = sideLength;
        context.fillStyle = "#aeaeae";
        context.fillRect(0, 0, sideLength, sideLength);
        context.fillStyle = "#dedede";
        for (var x = 0; x < sideLength; x += 4) {
            for (var y = 0; y < sideLength; y += 4) {
                if (((x + y) >> 2) & 1)
                    context.fillRect(x, y, 4, 4);
            }
        }
        return canvas.toDataURL();
    }
    function tileWeight(id) {
        switch (id) {
            case "myTiles.transparency16":
                return 1;
            case "myTiles.transparency8":
            case "myTiles.transparency32":
                return 2;
            default:
                if (id.startsWith("myTiles.tile")) {
                    var num = parseInt(id.slice(12));
                    if (!Number.isNaN(num))
                        return num + 2;
                }
                return 9999999999;
        }
    }
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggle = /** @class */ (function (_super) {
        __extends(FieldToggle, _super);
        function FieldToggle(state, params, opt_validator) {
            var _this = _super.call(this, state, undefined, undefined, undefined, opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.CURSOR = 'pointer';
            _this.params = params;
            _this.setValue(state);
            _this.addArgType('toggle');
            _this.type_ = params.type;
            return _this;
        }
        FieldToggle.prototype.init = function () {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null);
            if (!this.visible_) {
                this.fieldGroup_.style.display = 'none';
            }
            // Add an attribute to cassify the type of field.
            if (this.getArgTypes() !== null) {
                if (this.sourceBlock_.isShadow()) {
                    this.sourceBlock_.svgGroup_.setAttribute('data-argument-type', this.getArgTypes());
                }
                else {
                    // Fields without a shadow wrapper, like square dropdowns.
                    this.fieldGroup_.setAttribute('data-argument-type', this.getArgTypes());
                }
            }
            // If not in a shadow block, and has more than one input, draw a box.
            if (!this.sourceBlock_.isShadow()
                && (this.sourceBlock_.inputList && this.sourceBlock_.inputList.length > 1)) {
                this.borderRect_ = Blockly.utils.dom.createSvgElement('rect', {
                    'rx': Blockly.BlockSvg.CORNER_RADIUS,
                    'ry': Blockly.BlockSvg.CORNER_RADIUS,
                    'x': 0,
                    'y': 0,
                    'width': this.size_.width,
                    'height': this.size_.height,
                    'fill': this.sourceBlock_.getColour(),
                    'stroke': this.sourceBlock_.getColourTertiary()
                }, null);
                this.fieldGroup_.insertBefore(this.borderRect_, this.textElement_);
            }
            // Adjust X to be flipped for RTL. Position is relative to horizontal start of source block.
            var size = this.getSize();
            this.checkElement_ = Blockly.utils.dom.createSvgElement('g', {
                'class': "blocklyToggle " + (this.state_ ? 'blocklyToggleOn' : 'blocklyToggleOff'),
                'transform': "translate(8, " + size.height / 2 + ")",
            }, this.fieldGroup_);
            switch (this.getOutputShape()) {
                case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('polygon', {
                        'class': 'blocklyToggleRect',
                        'points': '-7,-14 -21,0 -7,14 7,14 21,0 7,-14',
                        'cursor': 'pointer'
                    }, this.checkElement_);
                    break;
                case Blockly.OUTPUT_SHAPE_ROUND:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('rect', {
                        'class': 'blocklyToggleCircle',
                        'x': -6, 'y': -14, 'height': 28,
                        'width': 28, 'rx': 14, 'ry': 14,
                        'cursor': 'pointer'
                    }, this.checkElement_);
                    break;
                case Blockly.OUTPUT_SHAPE_SQUARE:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('rect', {
                        'class': 'blocklyToggleRect',
                        'x': -6, 'y': -14, 'height': 28,
                        'width': 28, 'rx': 3, 'ry': 3,
                        'cursor': 'pointer'
                    }, this.checkElement_);
                    break;
            }
            var fieldX = (this.sourceBlock_.RTL) ? -size.width / 2 : size.width / 2;
            /** @type {!Element} */
            this.textElement_ = Blockly.utils.dom.createSvgElement('text', {
                'class': 'blocklyText',
                'x': fieldX,
                'dy': '0.6ex',
                'y': size.height / 2
            }, this.fieldGroup_);
            this.updateEditable();
            var svgRoot = this.sourceBlock_.getSvgRoot();
            svgRoot.appendChild(this.fieldGroup_);
            svgRoot.querySelector(".blocklyBlockBackground").setAttribute('fill', this.sourceBlock_.getColourTertiary());
            this.switchToggle(this.state_);
            this.setValue(this.getValue());
            // Force a render.
            this.render_();
            this.size_.width = 0;
            this.mouseDownWrapper_ =
                Blockly.bindEventWithChecks_(this.getClickTarget_(), 'mousedown', this, this.onMouseDown_);
        };
        FieldToggle.prototype.getDisplayText_ = function () {
            return this.state_ ? this.getTrueText() : this.getFalseText();
        };
        FieldToggle.prototype.getTrueText = function () {
            return lf("True");
        };
        FieldToggle.prototype.getFalseText = function () {
            return lf("False");
        };
        FieldToggle.prototype.updateSize_ = function () {
            switch (this.getOutputShape()) {
                case Blockly.OUTPUT_SHAPE_ROUND:
                    this.size_.width = this.getInnerWidth() * 2 - 7;
                    break;
                case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                    this.size_.width = this.getInnerWidth() * 2 + 8 - Math.floor(this.getInnerWidth() / 2);
                    break;
                case Blockly.OUTPUT_SHAPE_SQUARE:
                    this.size_.width = 9 + this.getInnerWidth() * 2;
                    break;
            }
        };
        FieldToggle.prototype.getInnerWidth = function () {
            return this.getMaxLength() * 10;
        };
        FieldToggle.prototype.getMaxLength = function () {
            return Math.max(this.getTrueText().length, this.getFalseText().length);
        };
        FieldToggle.prototype.getOutputShape = function () {
            return this.sourceBlock_.isShadow() ? this.sourceBlock_.getOutputShape() : Blockly.OUTPUT_SHAPE_SQUARE;
        };
        FieldToggle.prototype.doClassValidation_ = function (newBool) {
            return typeof this.fromVal(newBool) == "boolean" ? newBool : "false";
        };
        FieldToggle.prototype.applyColour = function () {
            var color = this.sourceBlock_.getColourTertiary();
            if (this.borderRect_) {
                this.borderRect_.setAttribute('stroke', color);
            }
            else {
                this.sourceBlock_.pathObject.svgPath.setAttribute('fill', color);
            }
        };
        ;
        /**
         * Return 'TRUE' if the toggle is ON, 'FALSE' otherwise.
         * @return {string} Current state.
         */
        FieldToggle.prototype.getValue = function () {
            return this.toVal(this.state_);
        };
        ;
        /**
         * Set the checkbox to be checked if newBool is 'TRUE' or true,
         * unchecks otherwise.
         * @param {string|boolean} newBool New state.
         */
        FieldToggle.prototype.doValueUpdate_ = function (newBool) {
            var newState = this.fromVal(newBool);
            if (this.state_ !== newState) {
                if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
                    Blockly.Events.fire(new Blockly.Events.BlockChange(this.sourceBlock_, 'field', this.name, this.state_, newState));
                }
                this.state_ = newState;
                this.switchToggle(this.state_);
                this.isDirty_ = true;
            }
        };
        FieldToggle.prototype.switchToggle = function (newState) {
            if (this.checkElement_) {
                this.updateSize_();
                var size = this.getSize();
                var innerWidth_1 = this.getInnerWidth();
                if (newState) {
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOn');
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOff');
                }
                else {
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOn');
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOff');
                }
                var outputShape = this.getOutputShape();
                var width = 0, halfWidth = 0;
                var leftPadding = 0, rightPadding = 0;
                switch (outputShape) {
                    case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                        width = innerWidth_1;
                        halfWidth = width / 2;
                        var quarterWidth = halfWidth / 2;
                        // TODO: the left padding calculation is a hack, we should calculate left padding based on width (generic case)
                        leftPadding = -halfWidth + quarterWidth;
                        rightPadding = -quarterWidth;
                        var topLeftPoint = -quarterWidth;
                        var bottomRightPoint = halfWidth;
                        this.toggleThumb_.setAttribute('points', topLeftPoint + ",-14 " + (topLeftPoint - 14) + ",0 " + topLeftPoint + ",14 " + bottomRightPoint + ",14 " + (bottomRightPoint + 14) + ",0 " + bottomRightPoint + ",-14");
                        break;
                    case Blockly.OUTPUT_SHAPE_ROUND:
                    case Blockly.OUTPUT_SHAPE_SQUARE:
                        width = 5 + innerWidth_1;
                        halfWidth = width / 2;
                        this.toggleThumb_.setAttribute('width', "" + width);
                        this.toggleThumb_.setAttribute('x', "-" + halfWidth);
                        leftPadding = rightPadding = outputShape == Blockly.OUTPUT_SHAPE_SQUARE ? 2 : -6;
                        break;
                }
                this.checkElement_.setAttribute('transform', "translate(" + (newState ? rightPadding + innerWidth_1 + halfWidth : halfWidth + leftPadding) + ", " + size.height / 2 + ")");
            }
        };
        FieldToggle.prototype.render_ = function () {
            if (this.visible_ && this.textElement_) {
                // Replace the text.
                goog.dom.removeChildren(/** @type {!Element} */ (this.textElement_));
                var textNode = document.createTextNode(this.getDisplayText_());
                this.textElement_.appendChild(textNode);
                pxt.BrowserUtils.addClass(this.textElement_, 'blocklyToggleText');
                this.updateSize_();
                // Update text centering, based on newly calculated width.
                var width = this.size_.width;
                var centerTextX = this.state_ ? (width + width / 8) : width / 2;
                // Apply new text element x position.
                var newX = centerTextX - width / 2;
                this.textElement_.setAttribute('x', "" + newX);
            }
            // Update any drawn box to the correct width and height.
            if (this.borderRect_) {
                this.borderRect_.setAttribute('width', "" + this.size_.width);
                this.borderRect_.setAttribute('height', "" + this.size_.height);
            }
        };
        /**
         * Toggle the state of the toggle.
         * @private
         */
        FieldToggle.prototype.showEditor_ = function () {
            var newState = !this.state_;
            /*
            if (this.sourceBlock_) {
              // Call any validation function, and allow it to override.
              newState = this.callValidator(newState);
            }*/
            if (newState !== null) {
                this.setValue(this.toVal(newState));
            }
        };
        FieldToggle.prototype.toVal = function (newState) {
            if (this.type_ == "number")
                return String(newState ? '1' : '0');
            else
                return String(newState ? 'true' : 'false');
        };
        FieldToggle.prototype.fromVal = function (val) {
            if (typeof val == "string") {
                if (val == "1" || val.toUpperCase() == "TRUE")
                    return true;
                return false;
            }
            return !!val;
        };
        return FieldToggle;
    }(Blockly.FieldNumber));
    pxtblockly.FieldToggle = FieldToggle;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="./field_toggle.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggleHighLow = /** @class */ (function (_super) {
        __extends(FieldToggleHighLow, _super);
        function FieldToggleHighLow(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleHighLow.prototype.getTrueText = function () {
            return lf("HIGH");
        };
        FieldToggleHighLow.prototype.getFalseText = function () {
            return lf("LOW");
        };
        return FieldToggleHighLow;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleHighLow = FieldToggleHighLow;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="./field_toggle.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggleOnOff = /** @class */ (function (_super) {
        __extends(FieldToggleOnOff, _super);
        function FieldToggleOnOff(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleOnOff.prototype.getTrueText = function () {
            return lf("ON");
        };
        FieldToggleOnOff.prototype.getFalseText = function () {
            return lf("OFF");
        };
        return FieldToggleOnOff;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleOnOff = FieldToggleOnOff;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="./field_toggle.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggleUpDown = /** @class */ (function (_super) {
        __extends(FieldToggleUpDown, _super);
        function FieldToggleUpDown(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleUpDown.prototype.getTrueText = function () {
            return lf("UP");
        };
        FieldToggleUpDown.prototype.getFalseText = function () {
            return lf("DOWN");
        };
        return FieldToggleUpDown;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleUpDown = FieldToggleUpDown;
    var FieldToggleDownUp = /** @class */ (function (_super) {
        __extends(FieldToggleDownUp, _super);
        function FieldToggleDownUp(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleDownUp.prototype.getTrueText = function () {
            return lf("DOWN");
        };
        FieldToggleDownUp.prototype.getFalseText = function () {
            return lf("UP");
        };
        return FieldToggleDownUp;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleDownUp = FieldToggleDownUp;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="./field_toggle.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggleWinLose = /** @class */ (function (_super) {
        __extends(FieldToggleWinLose, _super);
        function FieldToggleWinLose(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleWinLose.prototype.getTrueText = function () {
            return lf("WIN");
        };
        FieldToggleWinLose.prototype.getFalseText = function () {
            return lf("LOSE");
        };
        return FieldToggleWinLose;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleWinLose = FieldToggleWinLose;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
/// <reference path="./field_toggle.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldToggleYesNo = /** @class */ (function (_super) {
        __extends(FieldToggleYesNo, _super);
        function FieldToggleYesNo(state, params, opt_validator) {
            var _this = _super.call(this, state, params, opt_validator) || this;
            _this.isFieldCustom_ = true;
            return _this;
        }
        FieldToggleYesNo.prototype.getTrueText = function () {
            return lf("Yes");
        };
        FieldToggleYesNo.prototype.getFalseText = function () {
            return lf("No");
        };
        return FieldToggleYesNo;
    }(pxtblockly.FieldToggle));
    pxtblockly.FieldToggleYesNo = FieldToggleYesNo;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts" />
var pxtblockly;
(function (pxtblockly) {
    var FieldTsExpression = /** @class */ (function (_super) {
        __extends(FieldTsExpression, _super);
        function FieldTsExpression() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.isFieldCustom_ = true;
            _this.pythonMode = false;
            return _this;
        }
        /**
         * Same as parent, but adds a different class to text when disabled
         */
        FieldTsExpression.prototype.updateEditable = function () {
            var group = this.fieldGroup_;
            if (!this.EDITABLE || !group) {
                return;
            }
            if (this.sourceBlock_.isEditable()) {
                pxt.BrowserUtils.addClass(group, 'blocklyEditableText');
                pxt.BrowserUtils.removeClass(group, 'blocklyGreyExpressionBlockText');
                this.fieldGroup_.style.cursor = this.CURSOR;
            }
            else {
                pxt.BrowserUtils.addClass(group, 'blocklyGreyExpressionBlockText');
                pxt.BrowserUtils.removeClass(group, 'blocklyEditableText');
                this.fieldGroup_.style.cursor = '';
            }
        };
        FieldTsExpression.prototype.setPythonEnabled = function (enabled) {
            if (enabled === this.pythonMode)
                return;
            this.pythonMode = enabled;
            this.forceRerender();
        };
        FieldTsExpression.prototype.getText = function () {
            return this.pythonMode ? pxt.Util.lf("<python code>") : this.getValue();
        };
        FieldTsExpression.prototype.applyColour = function () {
            if (this.sourceBlock_ && this.constants_.FULL_BLOCK_FIELDS) {
                if (this.borderRect_) {
                    this.borderRect_.setAttribute('stroke', this.sourceBlock_.style.colourTertiary);
                }
            }
        };
        return FieldTsExpression;
    }(Blockly.FieldTextInput));
    pxtblockly.FieldTsExpression = FieldTsExpression;
})(pxtblockly || (pxtblockly = {}));
/// <reference path="../../localtypings/blockly.d.ts"/>
/// <reference path="../../built/pxtsim.d.ts"/>
var pxtblockly;
(function (pxtblockly) {
    var FieldTurnRatio = /** @class */ (function (_super) {
        __extends(FieldTurnRatio, _super);
        /**
         * Class for a color wheel field.
         * @param {number|string} value The initial content of the field.
         * @param {Function=} opt_validator An optional function that is called
         *     to validate any constraints on what the user entered.  Takes the new
         *     text as an argument and returns either the accepted text, a replacement
         *     text, or null to abort the change.
         * @extends {Blockly.FieldNumber}
         * @constructor
         */
        function FieldTurnRatio(value_, params, opt_validator) {
            var _this = _super.call(this, String(value_), '-200', '200', '1', '10', 'TurnRatio', opt_validator) || this;
            _this.isFieldCustom_ = true;
            _this.params = params;
            _this.sliderColor_ = '#a8aaa8';
            return _this;
        }
        FieldTurnRatio.prototype.createLabelDom_ = function (labelText) {
            var labelContainer = document.createElement('div');
            var svg = Blockly.utils.dom.createSvgElement('svg', {
                'xmlns': 'http://www.w3.org/2000/svg',
                'xmlns:html': 'http://www.w3.org/1999/xhtml',
                'xmlns:xlink': 'http://www.w3.org/1999/xlink',
                'version': '1.1',
                'height': (FieldTurnRatio.HALF + FieldTurnRatio.HANDLE_RADIUS + 10) + 'px',
                'width': (FieldTurnRatio.HALF * 2) + 'px'
            }, labelContainer);
            var defs = Blockly.utils.dom.createSvgElement('defs', {}, svg);
            var marker = Blockly.utils.dom.createSvgElement('marker', {
                'id': 'head',
                'orient': "auto",
                'markerWidth': '2',
                'markerHeight': '4',
                'refX': '0.1', 'refY': '1.5'
            }, defs);
            var markerPath = Blockly.utils.dom.createSvgElement('path', {
                'd': 'M0,0 V3 L1.5,1.5 Z',
                'fill': '#f12a21'
            }, marker);
            this.reporter_ = pxsim.svg.child(svg, "text", {
                'x': FieldTurnRatio.HALF, 'y': 96,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'style': 'font-size: 50px',
                'class': 'sim-text inverted number'
            });
            this.path_ = Blockly.utils.dom.createSvgElement('path', {
                'x1': FieldTurnRatio.HALF,
                'y1': FieldTurnRatio.HALF,
                'marker-end': 'url(#head)',
                'style': 'fill: none; stroke: #f12a21; stroke-width: 10'
            }, svg);
            this.updateGraph_();
            var readout = document.createElement('span');
            readout.setAttribute('class', 'blocklyFieldSliderReadout');
            return [labelContainer, readout];
        };
        ;
        FieldTurnRatio.prototype.updateGraph_ = function () {
            if (!this.path_) {
                return;
            }
            var v = goog.math.clamp(this.getValue() || 0, -200, 200);
            var x = v / 100;
            var nx = Math.max(-1, Math.min(1, x));
            var theta = Math.max(nx) * Math.PI / 2;
            var r = FieldTurnRatio.RADIUS - 6;
            var cx = FieldTurnRatio.HALF;
            var cy = FieldTurnRatio.HALF - 22;
            if (Math.abs(x) > 1) {
                cx -= (x - (x > 0 ? 1 : -1)) * r / 2; // move center of circle
            }
            var alpha = 0.2 + Math.abs(nx) * 0.5;
            var y1 = r * alpha;
            var y2 = r * Math.sin(Math.PI / 2 - theta);
            var x2 = r * Math.cos(Math.PI / 2 - theta);
            var y3 = y2 - r * alpha * Math.cos(2 * theta);
            var x3 = x2 - r * alpha * Math.sin(2 * theta);
            var d = "M " + cx + " " + cy + " C " + cx + " " + (cy - y1) + " " + (cx + x3) + " " + (cy - y3) + " " + (cx + x2) + " " + (cy - y2);
            this.path_.setAttribute('d', d);
            this.reporter_.textContent = "" + v;
        };
        FieldTurnRatio.prototype.setReadout_ = function (readout, value) {
            this.updateGraph_();
        };
        FieldTurnRatio.HALF = 80;
        FieldTurnRatio.HANDLE_RADIUS = 30;
        FieldTurnRatio.RADIUS = FieldTurnRatio.HALF - FieldTurnRatio.HANDLE_RADIUS - 1;
        return FieldTurnRatio;
    }(Blockly.FieldSlider));
    pxtblockly.FieldTurnRatio = FieldTurnRatio;
})(pxtblockly || (pxtblockly = {}));
var pxtblockly;
(function (pxtblockly) {
    var FieldUserEnum = /** @class */ (function (_super) {
        __extends(FieldUserEnum, _super);
        function FieldUserEnum(opts) {
            var _this = _super.call(this, createMenuGenerator(opts)) || this;
            _this.opts = opts;
            return _this;
        }
        FieldUserEnum.prototype.init = function () {
            _super.prototype.init.call(this);
            this.initVariables();
        };
        FieldUserEnum.prototype.onItemSelected_ = function (menu, menuItem) {
            var _this = this;
            var value = menuItem.getValue();
            if (value === "CREATE") {
                promptAndCreateEnum(this.sourceBlock_.workspace, this.opts, lf("New {0}:", this.opts.memberName), function (newName) { return newName && _this.setValue(newName); });
            }
            else {
                _super.prototype.onItemSelected_.call(this, menu, menuItem);
            }
        };
        FieldUserEnum.prototype.doClassValidation_ = function (value) {
            var _a;
            // update cached option list when adding a new kind
            if (((_a = this.opts) === null || _a === void 0 ? void 0 : _a.initialMembers) && !this.opts.initialMembers.find(function (el) { return el == value; }))
                this.getOptions();
            return _super.prototype.doClassValidation_.call(this, value);
        };
        FieldUserEnum.prototype.initVariables = function () {
            var _this = this;
            if (this.sourceBlock_ && this.sourceBlock_.workspace) {
                var ws_2 = this.sourceBlock_.workspace;
                var existing_2 = getMembersForEnum(ws_2, this.opts.name);
                this.opts.initialMembers.forEach(function (memberName) {
                    if (!existing_2.some(function (_a) {
                        var name = _a[0], value = _a[1];
                        return name === memberName;
                    })) {
                        createNewEnumMember(ws_2, _this.opts, memberName);
                    }
                });
                if (this.getValue() === "CREATE") {
                    var newValue = getVariableNameForMember(ws_2, this.opts.name, this.opts.initialMembers[0]);
                    if (newValue) {
                        this.setValue(newValue);
                    }
                }
            }
        };
        return FieldUserEnum;
    }(Blockly.FieldDropdown));
    pxtblockly.FieldUserEnum = FieldUserEnum;
    function createMenuGenerator(opts) {
        return function () {
            var res = [];
            var that = this;
            if (that.sourceBlock_ && that.sourceBlock_.workspace) {
                var options = that.sourceBlock_.workspace.getVariablesOfType(opts.name);
                options.forEach(function (model) {
                    // The format of the name is 10mem where "10" is the value and "mem" is the enum member
                    var withoutValue = model.name.replace(/^\d+/, "");
                    res.push([withoutValue, model.name]);
                });
            }
            else {
                // Can't create variables from within the flyout, so we just have to fake it
                opts.initialMembers.forEach(function (e) { return res.push([e, e]); });
            }
            res.push([lf("Add a new {0}...", opts.memberName), "CREATE"]);
            return res;
        };
    }
    function promptAndCreateEnum(ws, opts, message, cb) {
        Blockly.prompt(message, null, function (response) {
            if (response) {
                var nameIsValid = false;
                if (pxtc.isIdentifierStart(response.charCodeAt(0), 2)) {
                    nameIsValid = true;
                    for (var i = 1; i < response.length; i++) {
                        if (!pxtc.isIdentifierPart(response.charCodeAt(i), 2)) {
                            nameIsValid = false;
                        }
                    }
                }
                if (!nameIsValid) {
                    Blockly.alert(lf("Names must start with a letter and can only contain letters, numbers, '$', and '_'."), function () { return promptAndCreateEnum(ws, opts, message, cb); });
                    return;
                }
                var existing = getMembersForEnum(ws, opts.name);
                for (var i = 0; i < existing.length; i++) {
                    var _a = existing[i], name_11 = _a[0], value = _a[1];
                    if (name_11 === response) {
                        Blockly.alert(lf("A {0} named '{1}' already exists.", opts.memberName, response), function () { return promptAndCreateEnum(ws, opts, message, cb); });
                        return;
                    }
                }
                cb(createNewEnumMember(ws, opts, response));
            }
        }, { placeholder: opts.promptHint });
    }
    function parseName(model) {
        var match = /^(\d+)([^0-9].*)$/.exec(model.name);
        if (match) {
            return [match[2], parseInt(match[1])];
        }
        return [model.name, -1];
    }
    function getMembersForEnum(ws, enumName) {
        var existing = ws.getVariablesOfType(enumName);
        if (existing && existing.length) {
            return existing.map(parseName);
        }
        else {
            return [];
        }
    }
    function getNextValue(members, opts) {
        var existing = members.map(function (_a) {
            var name = _a[0], value = _a[1];
            return value;
        });
        if (opts.isBitMask) {
            for (var i = 0; i < existing.length; i++) {
                var current = 1 << i;
                if (existing.indexOf(current) < 0) {
                    return current;
                }
            }
            return 1 << existing.length;
        }
        else if (opts.isHash) {
            return 0; // overriden when compiled
        }
        else {
            var start = opts.firstValue || 0;
            for (var i = 0; i < existing.length; i++) {
                if (existing.indexOf(start + i) < 0) {
                    return start + i;
                }
            }
            return start + existing.length;
        }
    }
    pxtblockly.getNextValue = getNextValue;
    function createNewEnumMember(ws, opts, newName) {
        var ex = getMembersForEnum(ws, opts.name);
        var val = getNextValue(ex, opts);
        var variableName = val + newName;
        Blockly.Variables.getOrCreateVariablePackage(ws, null, variableName, opts.name);
        return variableName;
    }
    function getVariableNameForMember(ws, enumName, memberName) {
        var existing = ws.getVariablesOfType(enumName);
        if (existing && existing.length) {
            for (var i = 0; i < existing.length; i++) {
                var name_12 = parseName(existing[i])[0];
                if (name_12 === memberName) {
                    return existing[i].name;
                }
            }
        }
        return undefined;
    }
})(pxtblockly || (pxtblockly = {}));
var pxtblockly;
(function (pxtblockly) {
    var svg;
    (function (svg) {
        function hasClass(el, cls) {
            return pxt.BrowserUtils.containsClass(el, cls);
        }
        svg.hasClass = hasClass;
        function addClass(el, cls) {
            pxt.BrowserUtils.addClass(el, cls);
        }
        svg.addClass = addClass;
        function removeClass(el, cls) {
            pxt.BrowserUtils.removeClass(el, cls);
        }
        svg.removeClass = removeClass;
    })(svg = pxtblockly.svg || (pxtblockly.svg = {}));
    function parseColour(colour) {
        var hue = Number(colour);
        if (!isNaN(hue)) {
            return Blockly.hueToRgb(hue);
        }
        else if (goog.isString(colour) && colour.match(/^#[0-9a-fA-F]{6}$/)) {
            return colour;
        }
        else {
            return '#000';
        }
    }
    pxtblockly.parseColour = parseColour;
    /**
     * Converts a bitmap into a square image suitable for display. In light mode the preview
     * is drawn with no transparency (alpha is filled with background color)
     */
    function bitmapToImageURI(frame, sideLength, lightMode) {
        var colors = pxt.appTarget.runtime.palette.slice(1);
        var canvas = document.createElement("canvas");
        canvas.width = sideLength;
        canvas.height = sideLength;
        // Works well for all of our default sizes, does not work well if the size is not
        // a multiple of 2 or is greater than 32 (i.e. from the decompiler)
        var cellSize = Math.min(sideLength / frame.width, sideLength / frame.height);
        // Center the image if it isn't square
        var xOffset = Math.max(Math.floor((sideLength * (1 - (frame.width / frame.height))) / 2), 0);
        var yOffset = Math.max(Math.floor((sideLength * (1 - (frame.height / frame.width))) / 2), 0);
        var context;
        if (lightMode) {
            context = canvas.getContext("2d", { alpha: false });
            context.fillStyle = "#dedede";
            context.fillRect(0, 0, sideLength, sideLength);
        }
        else {
            context = canvas.getContext("2d");
        }
        for (var c = 0; c < frame.width; c++) {
            for (var r = 0; r < frame.height; r++) {
                var color = frame.get(c, r);
                if (color) {
                    context.fillStyle = colors[color - 1];
                    context.fillRect(xOffset + c * cellSize, yOffset + r * cellSize, cellSize, cellSize);
                }
                else if (lightMode) {
                    context.fillStyle = "#dedede";
                    context.fillRect(xOffset + c * cellSize, yOffset + r * cellSize, cellSize, cellSize);
                }
            }
        }
        return canvas.toDataURL();
    }
    pxtblockly.bitmapToImageURI = bitmapToImageURI;
    function tilemapToImageURI(data, sideLength, lightMode, blocksInfo) {
        var colors = pxt.appTarget.runtime.palette.slice();
        var canvas = document.createElement("canvas");
        canvas.width = sideLength;
        canvas.height = sideLength;
        // Works well for all of our default sizes, does not work well if the size is not
        // a multiple of 2 or is greater than 32 (i.e. from the decompiler)
        var cellSize = Math.min(sideLength / data.tilemap.width, sideLength / data.tilemap.height);
        // Center the image if it isn't square
        var xOffset = Math.max(Math.floor((sideLength * (1 - (data.tilemap.width / data.tilemap.height))) / 2), 0);
        var yOffset = Math.max(Math.floor((sideLength * (1 - (data.tilemap.height / data.tilemap.width))) / 2), 0);
        var context;
        if (lightMode) {
            context = canvas.getContext("2d", { alpha: false });
            context.fillStyle = "#dedede";
            context.fillRect(0, 0, sideLength, sideLength);
        }
        else {
            context = canvas.getContext("2d");
        }
        var tileColors = [];
        for (var c = 0; c < data.tilemap.width; c++) {
            for (var r = 0; r < data.tilemap.height; r++) {
                var tile = data.tilemap.get(c, r);
                if (tile) {
                    if (!tileColors[tile]) {
                        var tileInfo = data.tileset.tiles[tile];
                        tileColors[tile] = tileInfo ? pxt.sprite.computeAverageColor(pxt.sprite.Bitmap.fromData(tileInfo.bitmap), colors) : "#dedede";
                    }
                    context.fillStyle = tileColors[tile];
                    context.fillRect(xOffset + c * cellSize, yOffset + r * cellSize, cellSize, cellSize);
                }
                else if (lightMode) {
                    context.fillStyle = "#dedede";
                    context.fillRect(xOffset + c * cellSize, yOffset + r * cellSize, cellSize, cellSize);
                }
            }
        }
        return canvas.toDataURL();
    }
    pxtblockly.tilemapToImageURI = tilemapToImageURI;
    function deleteTilesetTileIfExists(ws, tile) {
        var existing = ws.getVariablesOfType(pxt.sprite.BLOCKLY_TILESET_TYPE);
        for (var _i = 0, existing_3 = existing; _i < existing_3.length; _i++) {
            var model = existing_3[_i];
            if (parseInt(model.name.substr(0, model.name.indexOf(";"))) === tile.projectId) {
                ws.deleteVariableById(model.getId());
                break;
            }
        }
    }
    function getAllBlocksWithTilemaps(ws) {
        return getAllFieldsCore(ws, function (f) { return f instanceof pxtblockly.FieldTilemap && !f.isGreyBlock; });
    }
    pxtblockly.getAllBlocksWithTilemaps = getAllBlocksWithTilemaps;
    function getAllBlocksWithTilesets(ws) {
        return getAllFieldsCore(ws, function (f) { return f instanceof pxtblockly.FieldTileset; });
    }
    pxtblockly.getAllBlocksWithTilesets = getAllBlocksWithTilesets;
    function needsTilemapUpgrade(ws) {
        var allTiles = ws.getVariablesOfType(pxt.sprite.BLOCKLY_TILESET_TYPE).map(function (model) { return pxt.sprite.legacy.blocklyVariableToTile(model.name); });
        return !!allTiles.length;
    }
    pxtblockly.needsTilemapUpgrade = needsTilemapUpgrade;
    function upgradeTilemapsInWorkspace(ws, proj) {
        var allTiles = ws.getVariablesOfType(pxt.sprite.BLOCKLY_TILESET_TYPE).map(function (model) { return pxt.sprite.legacy.blocklyVariableToTile(model.name); });
        if (!allTiles.length)
            return;
        Blockly.Events.disable();
        var customMapping = [];
        for (var _i = 0, allTiles_1 = allTiles; _i < allTiles_1.length; _i++) {
            var tile = allTiles_1[_i];
            if (tile.qualifiedName) {
                customMapping[tile.projectId] = proj.resolveTile(tile.qualifiedName);
            }
            else if (tile.data) {
                customMapping[tile.projectId] = proj.createNewTile(tile.data, "myTiles.tile" + tile.projectId);
            }
            deleteTilesetTileIfExists(ws, tile);
        }
        var tilemaps = getAllBlocksWithTilemaps(ws);
        var _loop_8 = function (tilemap) {
            var legacy = pxt.sprite.legacy.decodeTilemap(tilemap.ref.getInitText(), "typescript");
            var mapping = [];
            var newData = new pxt.sprite.TilemapData(legacy.tilemap, {
                tileWidth: legacy.tileset.tileWidth,
                tiles: legacy.tileset.tiles.map(function (t, index) {
                    if (t.projectId != null) {
                        return customMapping[t.projectId];
                    }
                    if (!mapping[index]) {
                        mapping[index] = proj.resolveTile(t.qualifiedName);
                    }
                    return mapping[index];
                })
            }, legacy.layers);
            tilemap.ref.setValue(pxt.sprite.encodeTilemap(newData, "typescript"));
        };
        for (var _a = 0, tilemaps_2 = tilemaps; _a < tilemaps_2.length; _a++) {
            var tilemap = tilemaps_2[_a];
            _loop_8(tilemap);
        }
        var tilesets = getAllBlocksWithTilesets(ws);
        for (var _b = 0, tilesets_1 = tilesets; _b < tilesets_1.length; _b++) {
            var tileset = tilesets_1[_b];
            // Force a re-render
            tileset.ref.doValueUpdate_(tileset.ref.getValue());
            if (tileset.ref.isDirty_) {
                tileset.ref.forceRerender();
            }
        }
        Blockly.Events.enable();
    }
    pxtblockly.upgradeTilemapsInWorkspace = upgradeTilemapsInWorkspace;
    function getAllFieldsCore(ws, predicate) {
        var result = [];
        var top = ws.getTopBlocks(false);
        top.forEach(function (block) { return getAllFieldsRecursive(block); });
        return result;
        function getAllFieldsRecursive(block) {
            for (var _i = 0, _a = block.inputList; _i < _a.length; _i++) {
                var input = _a[_i];
                for (var _b = 0, _c = input.fieldRow; _b < _c.length; _b++) {
                    var field = _c[_b];
                    if (predicate(field)) {
                        result.push({ block: block, field: field.name, ref: field });
                    }
                }
                if (input.connection && input.connection.targetBlock()) {
                    getAllFieldsRecursive(input.connection.targetBlock());
                }
            }
            if (block.nextConnection && block.nextConnection.targetBlock()) {
                getAllFieldsRecursive(block.nextConnection.targetBlock());
            }
        }
    }
    function getAllReferencedTiles(workspace, excludeBlockID) {
        var all = {};
        var allMaps = getAllBlocksWithTilemaps(workspace);
        for (var _i = 0, allMaps_1 = allMaps; _i < allMaps_1.length; _i++) {
            var map = allMaps_1[_i];
            if (map.block.id === excludeBlockID)
                continue;
            for (var _a = 0, _b = map.ref.getTileset().tiles; _a < _b.length; _a++) {
                var tile = _b[_a];
                all[tile.id] = tile;
            }
        }
        var project = pxt.react.getTilemapProject();
        var projectMaps = project.getAllTilemaps();
        for (var _c = 0, projectMaps_1 = projectMaps; _c < projectMaps_1.length; _c++) {
            var projectMap = projectMaps_1[_c];
            for (var _d = 0, _e = projectMap.data.tileset.tiles; _d < _e.length; _d++) {
                var tile = _e[_d];
                all[tile.id] = tile;
            }
        }
        var allTiles = getAllBlocksWithTilesets(workspace);
        for (var _f = 0, allTiles_2 = allTiles; _f < allTiles_2.length; _f++) {
            var tilesetField = allTiles_2[_f];
            var id = tilesetField.ref.getValue();
            if (!all[id]) {
                all[id] = project.resolveTile(id);
            }
        }
        return Object.keys(all).map(function (key) { return all[key]; });
    }
    pxtblockly.getAllReferencedTiles = getAllReferencedTiles;
})(pxtblockly || (pxtblockly = {}));
