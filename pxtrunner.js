var pxt;
(function (pxt) {
    var runner;
    (function (runner) {
        /**
         * Starts the simulator and injects it into the provided container.
         * the simulator will attempt to establish a websocket connection
         * to the debugger's user interface on port 3234.
         *
         * @param container The container to inject the simulator into
         */
        function startDebuggerAsync(container) {
            var debugRunner = new DebugRunner(container);
            debugRunner.start();
        }
        runner.startDebuggerAsync = startDebuggerAsync;
        /**
         * Runner for the debugger that handles communication with the user
         * interface. Also talks to the server for anything to do with
         * the filesystem (like reading code)
         */
        var DebugRunner = /** @class */ (function () {
            function DebugRunner(container) {
                this.container = container;
                this.pkgLoaded = false;
                this.intervalRunning = false;
            }
            DebugRunner.prototype.start = function () {
                var _this = this;
                this.initializeWebsocket();
                if (!this.intervalRunning) {
                    this.intervalRunning = true;
                    this.intervalId = setInterval(function () {
                        if (!_this.ws) {
                            try {
                                _this.initializeWebsocket();
                            }
                            catch (e) {
                                console.warn("Connection to server failed, retrying in " + DebugRunner.RETRY_MS + " ms");
                            }
                        }
                    }, DebugRunner.RETRY_MS);
                }
                this.session = new pxsim.SimDebugSession(this.container);
                this.session.start(this);
            };
            DebugRunner.prototype.initializeWebsocket = function () {
                var _this = this;
                if (!pxt.BrowserUtils.isLocalHost() || !pxt.Cloud.localToken)
                    return;
                pxt.debug('initializing debug pipe');
                this.ws = new WebSocket('ws://localhost:3234/' + pxt.Cloud.localToken + '/simdebug');
                this.ws.onopen = function (ev) {
                    pxt.debug('debug: socket opened');
                };
                this.ws.onclose = function (ev) {
                    pxt.debug('debug: socket closed');
                    if (_this.closeListener) {
                        _this.closeListener();
                    }
                    _this.session.stopSimulator();
                    _this.ws = undefined;
                };
                this.ws.onerror = function (ev) {
                    pxt.debug('debug: socket closed due to error');
                    if (_this.errorListener) {
                        _this.errorListener(ev.type);
                    }
                    _this.session.stopSimulator();
                    _this.ws = undefined;
                };
                this.ws.onmessage = function (ev) {
                    var message;
                    try {
                        message = JSON.parse(ev.data);
                    }
                    catch (e) {
                        pxt.debug('debug: could not parse message');
                    }
                    if (message) {
                        // FIXME: ideally, we should just open two websockets instead of adding to the
                        // debug protocol. One for the debugger, one for meta-information and file
                        // system requests
                        if (message.type === 'runner') {
                            _this.handleRunnerMessage(message);
                        }
                        else {
                            // Intercept the launch configuration and notify the server-side debug runner
                            if (message.type === "request" && message.command === "launch") {
                                _this.sendRunnerMessage("configure", {
                                    projectDir: message.arguments.projectDir
                                });
                            }
                            _this.dataListener(message);
                        }
                    }
                };
            };
            DebugRunner.prototype.send = function (msg) {
                this.ws.send(msg);
            };
            DebugRunner.prototype.onData = function (cb) {
                this.dataListener = cb;
            };
            DebugRunner.prototype.onError = function (cb) {
                this.errorListener = cb;
            };
            DebugRunner.prototype.onClose = function (cb) {
                this.closeListener = cb;
            };
            DebugRunner.prototype.close = function () {
                if (this.session) {
                    this.session.stopSimulator(true);
                }
                if (this.intervalRunning) {
                    clearInterval(this.intervalId);
                    this.intervalId = undefined;
                }
                if (this.ws) {
                    this.ws.close();
                }
            };
            DebugRunner.prototype.handleRunnerMessage = function (msg) {
                switch (msg.subtype) {
                    case "ready":
                        this.sendRunnerMessage("ready");
                        break;
                    case "runcode":
                        this.runCode(msg);
                        break;
                }
            };
            DebugRunner.prototype.runCode = function (msg) {
                var breakpoints = [];
                // The breakpoints are in the format returned by the compiler
                // and need to be converted to the format used by the DebugProtocol
                msg.breakpoints.forEach(function (bp) {
                    breakpoints.push([bp.id, {
                            verified: true,
                            line: bp.line,
                            column: bp.column,
                            endLine: bp.endLine,
                            endColumn: bp.endColumn,
                            source: {
                                path: bp.fileName
                            }
                        }]);
                });
                this.session.runCode(msg.code, msg.usedParts, msg.usedArguments, new pxsim.BreakpointMap(breakpoints), pxt.appTarget.simulator.boardDefinition);
            };
            DebugRunner.prototype.sendRunnerMessage = function (subtype, msg) {
                if (msg === void 0) { msg = {}; }
                msg["subtype"] = subtype;
                msg["type"] = "runner";
                this.send(JSON.stringify(msg));
            };
            DebugRunner.RETRY_MS = 2500;
            return DebugRunner;
        }());
        runner.DebugRunner = DebugRunner;
    })(runner = pxt.runner || (pxt.runner = {}));
})(pxt || (pxt = {}));
/* tslint:disable:no-jquery-raw-elements TODO(tslint): get rid of jquery html() calls */
var pxt;
(function (pxt) {
    var runner;
    (function (runner) {
        var JS_ICON = "icon xicon js";
        var PY_ICON = "icon xicon python";
        var BLOCKS_ICON = "icon xicon blocks";
        var PY_FILE = "main.py";
        var BLOCKS_FILE = "main.blocks";
        function defaultClientRenderOptions() {
            var renderOptions = {
                blocksAspectRatio: window.innerHeight < window.innerWidth ? 1.62 : 1 / 1.62,
                snippetClass: 'lang-blocks',
                signatureClass: 'lang-sig',
                blocksClass: 'lang-block',
                blocksXmlClass: 'lang-blocksxml',
                diffBlocksXmlClass: 'lang-diffblocksxml',
                diffClass: 'lang-diff',
                diffStaticPythonClass: 'lang-diffspy',
                diffBlocksClass: 'lang-diffblocks',
                staticPythonClass: 'lang-spy',
                simulatorClass: 'lang-sim',
                linksClass: 'lang-cards',
                namespacesClass: 'lang-namespaces',
                apisClass: 'lang-apis',
                codeCardClass: 'lang-codecard',
                packageClass: 'lang-package',
                jresClass: 'lang-jres',
                projectClass: 'lang-project',
                snippetReplaceParent: true,
                simulator: true,
                showEdit: true,
                hex: true,
                tutorial: false,
                showJavaScript: false,
                hexName: pxt.appTarget.id
            };
            return renderOptions;
        }
        runner.defaultClientRenderOptions = defaultClientRenderOptions;
        function highlight($js) {
            if (typeof hljs !== "undefined") {
                if ($js.hasClass("highlight")) {
                    hljs.highlightBlock($js[0]);
                }
                else {
                    $js.find('code.highlight').each(function (i, block) {
                        hljs.highlightBlock(block);
                    });
                }
                highlightLine($js);
            }
        }
        function highlightLine($js) {
            // apply line highlighting
            $js.find("span.hljs-comment:contains(@highlight)")
                .each(function (i, el) {
                try {
                    highlightLineElement(el);
                }
                catch (e) {
                    pxt.reportException(e);
                }
            });
        }
        function highlightLineElement(el) {
            var $el = $(el);
            var span = document.createElement("span");
            span.className = "highlight-line";
            // find new line and split text node
            var next = el.nextSibling;
            if (!next || next.nodeType != Node.TEXT_NODE)
                return; // end of snippet?
            var text = next.textContent;
            var inewline = text.indexOf('\n');
            if (inewline < 0)
                return; // there should have been a new line here
            // split the next node
            next.textContent = text.substring(0, inewline + 1);
            $(document.createTextNode(text.substring(inewline + 1).replace(/^\s+/, ''))).insertAfter($(next));
            // process and highlight new line
            next = next.nextSibling;
            while (next) {
                var nextnext = next.nextSibling; // before we hoist it from the tree
                if (next.nodeType == Node.TEXT_NODE) {
                    text = next.textContent;
                    var inewline_1 = text.indexOf('\n');
                    if (inewline_1 < 0) {
                        span.appendChild(next);
                        next = nextnext;
                    }
                    else {
                        // we've hit the end of the line... split node in two
                        span.appendChild(document.createTextNode(text.substring(0, inewline_1)));
                        next.textContent = text.substring(inewline_1 + 1);
                        break;
                    }
                }
                else {
                    span.appendChild(next);
                    next = nextnext;
                }
            }
            // insert back
            $(span).insertAfter($el);
            // remove line entry
            $el.remove();
        }
        function appendBlocks($parent, $svg) {
            $parent.append($("<div class=\"ui content blocks\"/>").append($svg));
        }
        function appendJs($parent, $js, woptions) {
            $parent.append($("<div class=\"ui content js\"><div class=\"subheading\"><i class=\"ui icon xicon js\"></i>JavaScript</div></div>").append($js));
            highlight($js);
        }
        function appendPy($parent, $py, woptions) {
            $parent.append($("<div class=\"ui content py\"><div class=\"subheading\"><i class=\"ui icon xicon python\"></i>Python</div></div>").append($py));
            highlight($py);
        }
        function snippetBtn(label, icon) {
            var $btn = $("<a class=\"item\" role=\"button\" tabindex=\"0\"><i role=\"presentation\" aria-hidden=\"true\"></i><span class=\"ui desktop only\"></span></a>");
            $btn.attr("aria-label", label);
            $btn.attr("title", label);
            $btn.find('i').attr("class", icon);
            $btn.find('span').text(label);
            addFireClickOnEnter($btn);
            return $btn;
        }
        function addFireClickOnEnter(el) {
            el.keypress(function (e) {
                var charCode = (typeof e.which == "number") ? e.which : e.keyCode;
                if (charCode === 13 /* enter */ || charCode === 32 /* space */) {
                    e.preventDefault();
                    e.currentTarget.click();
                }
            });
        }
        function fillWithWidget(options, $container, $js, $py, $svg, decompileResult, woptions) {
            if (woptions === void 0) { woptions = {}; }
            var $h = $('<div class="ui bottom attached tabular icon small compact menu hideprint">'
                + ' <div class="right icon menu"></div></div>');
            var $c = $('<div class="ui top attached segment codewidget"></div>');
            var $menu = $h.find('.right.menu');
            var theme = pxt.appTarget.appTheme || {};
            if (woptions.showEdit && !theme.hideDocsEdit && decompileResult) { // edit button
                var $editBtn = snippetBtn(lf("Edit"), "edit icon");
                var pkg = decompileResult.package, compileBlocks = decompileResult.compileBlocks, compilePython = decompileResult.compilePython;
                var host = pkg.host();
                if ($svg && compileBlocks) {
                    pkg.setPreferredEditor(pxt.BLOCKS_PROJECT_NAME);
                    host.writeFile(pkg, BLOCKS_FILE, compileBlocks.outfiles[BLOCKS_FILE]);
                }
                else if ($py && compilePython) {
                    pkg.setPreferredEditor(pxt.PYTHON_PROJECT_NAME);
                    host.writeFile(pkg, PY_FILE, compileBlocks.outfiles[PY_FILE]);
                }
                else {
                    pkg.setPreferredEditor(pxt.JAVASCRIPT_PROJECT_NAME);
                }
                if (options.jres) {
                    host.writeFile(pkg, pxt.TILEMAP_JRES, options.jres);
                    host.writeFile(pkg, pxt.TILEMAP_CODE, pxt.emitTilemapsFromJRes(JSON.parse(options.jres)));
                    pkg.config.files.push(pxt.TILEMAP_JRES);
                    pkg.config.files.push(pxt.TILEMAP_CODE);
                }
                var compressed_1 = pkg.compressToFileAsync();
                $editBtn.click(function () {
                    pxt.tickEvent("docs.btn", { button: "edit" });
                    compressed_1.done(function (buf) {
                        window.open(getEditUrl(options) + "/#project:" + ts.pxtc.encodeBase64(pxt.Util.uint8ArrayToString(buf)), 'pxt');
                    });
                });
                $menu.append($editBtn);
            }
            if (options.showJavaScript || (!$svg && !$py)) {
                // js
                $c.append($js);
                appendBlocksButton();
                appendPyButton();
            }
            else if ($svg) {
                // blocks
                $c.append($svg);
                appendJsButton();
                appendPyButton();
            }
            else if ($py) {
                $c.append($py);
                appendBlocksButton();
                appendJsButton();
            }
            // runner menu
            if (woptions.run && !theme.hideDocsSimulator) {
                var $runBtn = snippetBtn(lf("Run"), "play icon").click(function () {
                    pxt.tickEvent("docs.btn", { button: "sim" });
                    if ($c.find('.sim')[0]) {
                        $c.find('.sim').remove(); // remove previous simulators
                        scrollJQueryIntoView($c);
                    }
                    else {
                        var padding = '81.97%';
                        if (pxt.appTarget.simulator)
                            padding = (100 / pxt.appTarget.simulator.aspectRatio) + '%';
                        var deps = options.package ? "&deps=" + encodeURIComponent(options.package) : "";
                        var url = getRunUrl(options) + "#nofooter=1" + deps;
                        var data = encodeURIComponent($js.text());
                        var $embed = $("<div class=\"ui card sim\"><div class=\"ui content\"><div style=\"position:relative;height:0;padding-bottom:" + padding + ";overflow:hidden;\"><iframe style=\"position:absolute;top:0;left:0;width:100%;height:100%;\" src=\"" + url + "\" data-code=\"" + data + "\" allowfullscreen=\"allowfullscreen\" sandbox=\"allow-popups allow-forms allow-scripts allow-same-origin\" frameborder=\"0\"></iframe></div></div></div>");
                        $c.append($embed);
                        scrollJQueryIntoView($embed);
                    }
                });
                $menu.append($runBtn);
            }
            if (woptions.hexname && woptions.hex) {
                var $hexBtn = snippetBtn(lf("Download"), "download icon").click(function () {
                    pxt.tickEvent("docs.btn", { button: "hex" });
                    pxt.BrowserUtils.browserDownloadBinText(woptions.hex, woptions.hexname, pxt.appTarget.compile.hexMimeType);
                });
                $menu.append($hexBtn);
            }
            var r = $("<div class=codesnippet></div>");
            // don't add menu if empty
            if ($menu.children().length)
                r.append($h);
            r.append($c);
            // inject container
            $container.replaceWith(r);
            function appendBlocksButton() {
                if (!$svg)
                    return;
                var $svgBtn = snippetBtn(lf("Blocks"), BLOCKS_ICON).click(function () {
                    pxt.tickEvent("docs.btn", { button: "blocks" });
                    if ($c.find('.blocks')[0]) {
                        $c.find('.blocks').remove();
                        scrollJQueryIntoView($c);
                    }
                    else {
                        if ($js)
                            appendBlocks($js.parent(), $svg);
                        else
                            appendBlocks($c, $svg);
                        scrollJQueryIntoView($svg);
                    }
                });
                $menu.append($svgBtn);
            }
            function appendJsButton() {
                if (!$js)
                    return;
                if (woptions.showJs)
                    appendJs($c, $js, woptions);
                else {
                    var $jsBtn = snippetBtn("JavaScript", JS_ICON).click(function () {
                        pxt.tickEvent("docs.btn", { button: "js" });
                        if ($c.find('.js')[0]) {
                            $c.find('.js').remove();
                            scrollJQueryIntoView($c);
                        }
                        else {
                            if ($svg)
                                appendJs($svg.parent(), $js, woptions);
                            else
                                appendJs($c, $js, woptions);
                            scrollJQueryIntoView($js);
                        }
                    });
                    $menu.append($jsBtn);
                }
            }
            function appendPyButton() {
                if (!$py)
                    return;
                if (woptions.showPy) {
                    appendPy($c, $py, woptions);
                }
                else {
                    var $pyBtn = snippetBtn("Python", PY_ICON).click(function () {
                        pxt.tickEvent("docs.btn", { button: "py" });
                        if ($c.find('.py')[0]) {
                            $c.find('.py').remove();
                            scrollJQueryIntoView($c);
                        }
                        else {
                            if ($svg)
                                appendPy($svg.parent(), $py, woptions);
                            else
                                appendPy($c, $py, woptions);
                            scrollJQueryIntoView($py);
                        }
                    });
                    $menu.append($pyBtn);
                }
            }
            function scrollJQueryIntoView($toScrollTo) {
                var _a;
                (_a = $toScrollTo[0]) === null || _a === void 0 ? void 0 : _a.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        }
        var renderQueue = [];
        function consumeRenderQueueAsync() {
            var existingFilters = {};
            return consumeNext()
                .then(function () {
                Blockly.Workspace.getAll().forEach(function (el) { return el.dispose(); });
                pxt.blocks.cleanRenderingWorkspace();
            });
            function consumeNext() {
                var job = renderQueue.shift();
                if (!job)
                    return Promise.resolve(); // done
                var el = job.el, options = job.options, render = job.render;
                return pxt.runner.decompileSnippetAsync(el.text(), options)
                    .then(function (r) {
                    var errors = r.compileJS && r.compileJS.diagnostics && r.compileJS.diagnostics.filter(function (d) { return d.category == pxtc.DiagnosticCategory.Error; });
                    if (errors && errors.length) {
                        errors.forEach(function (diag) { return pxt.reportError("docs.decompile", "" + diag.messageText, { "code": diag.code + "" }); });
                    }
                    // filter out any blockly definitions from the svg that would be duplicates on the page
                    r.blocksSvg.querySelectorAll("defs *").forEach(function (el) {
                        if (existingFilters[el.id]) {
                            el.remove();
                        }
                        else {
                            existingFilters[el.id] = true;
                        }
                    });
                    render(el, r);
                }, function (e) {
                    pxt.reportException(e);
                    el.append($('<div/>').addClass("ui segment warning").text(e.message));
                }).finally(function () {
                    el.removeClass("lang-shadow");
                    return consumeNext();
                });
            }
        }
        function renderNextSnippetAsync(cls, render, options) {
            if (!cls)
                return Promise.resolve();
            var $el = $("." + cls).first();
            if (!$el[0])
                return Promise.resolve();
            if (!options.emPixels)
                options.emPixels = 18;
            if (!options.layout)
                options.layout = pxt.blocks.BlockLayout.Align;
            options.splitSvg = true;
            renderQueue.push({ el: $el, source: $el.text(), options: options, render: render });
            $el.addClass("lang-shadow");
            $el.removeClass(cls);
            return renderNextSnippetAsync(cls, render, options);
        }
        function renderSnippetsAsync(options) {
            if (options.tutorial) {
                // don't render chrome for tutorials
                return renderNextSnippetAsync(options.snippetClass, function (c, r) {
                    var s = r.blocksSvg;
                    if (options.snippetReplaceParent)
                        c = c.parent();
                    var segment = $('<div class="ui segment codewidget"/>').append(s);
                    c.replaceWith(segment);
                }, { package: options.package, snippetMode: false, aspectRatio: options.blocksAspectRatio, jres: options.jres });
            }
            var snippetCount = 0;
            return renderNextSnippetAsync(options.snippetClass, function (c, r) {
                var s = r.compileBlocks && r.compileBlocks.success ? $(r.blocksSvg) : undefined;
                var p = r.compilePython && r.compilePython.success && r.compilePython.outfiles["main.py"];
                var js = $('<code class="lang-typescript highlight"/>').text(c.text().trim());
                var py = p ? $('<code class="lang-python highlight"/>').text(p.trim()) : undefined;
                if (options.snippetReplaceParent)
                    c = c.parent();
                var compiled = r.compileJS && r.compileJS.success;
                // TODO should this use pxt.outputName() and not pxtc.BINARY_HEX
                var hex = options.hex && compiled && r.compileJS.outfiles[pxtc.BINARY_HEX]
                    ? r.compileJS.outfiles[pxtc.BINARY_HEX] : undefined;
                var hexname = (pxt.appTarget.nickname || pxt.appTarget.id) + "-" + (options.hexName || '') + "-" + snippetCount++ + ".hex";
                fillWithWidget(options, c, js, py, s, r, {
                    showEdit: options.showEdit,
                    run: options.simulator,
                    hexname: hexname,
                    hex: hex,
                });
            }, { package: options.package, aspectRatio: options.blocksAspectRatio, jres: options.jres });
        }
        function decompileCallInfo(stmt) {
            if (!stmt || stmt.kind != ts.SyntaxKind.ExpressionStatement)
                return null;
            var estmt = stmt;
            if (!estmt.expression || estmt.expression.kind != ts.SyntaxKind.CallExpression)
                return null;
            var call = estmt.expression;
            var info = pxtc.pxtInfo(call).callInfo;
            return info;
        }
        function renderSignaturesAsync(options) {
            return renderNextSnippetAsync(options.signatureClass, function (c, r) {
                var _a, _b, _c, _d, _e;
                var cjs = r.compileProgram;
                if (!cjs)
                    return;
                var file = cjs.getSourceFile("main.ts");
                var info = decompileCallInfo(file.statements[0]);
                if (!info || !r.apiInfo)
                    return;
                var symbolInfo = r.apiInfo.byQName[info.qName];
                if (!symbolInfo)
                    return;
                var block = Blockly.Blocks[symbolInfo.attributes.blockId];
                var xml = ((_b = (_a = block) === null || _a === void 0 ? void 0 : _a.codeCard) === null || _b === void 0 ? void 0 : _b.blocksXml) || undefined;
                var blocksHtml = xml ? pxt.blocks.render(xml) : ((_c = r.compileBlocks) === null || _c === void 0 ? void 0 : _c.success) ? r.blocksSvg : undefined;
                var s = blocksHtml ? $(blocksHtml) : undefined;
                var jsSig = ts.pxtc.service.displayStringForSymbol(symbolInfo, /** python **/ false, r.apiInfo)
                    .split("\n")[1] + ";";
                var js = $('<code class="lang-typescript highlight"/>').text(jsSig);
                var pySig = ((_e = (_d = pxt.appTarget) === null || _d === void 0 ? void 0 : _d.appTheme) === null || _e === void 0 ? void 0 : _e.python) && ts.pxtc.service.displayStringForSymbol(symbolInfo, /** python **/ true, r.apiInfo).split("\n")[1];
                var py = pySig && $('<code class="lang-python highlight"/>').text(pySig);
                if (options.snippetReplaceParent)
                    c = c.parent();
                // add an html widge that allows to translate the block
                if (pxt.Util.isTranslationMode()) {
                    var trs = $('<div class="ui segment" />');
                    trs.append($("<div class=\"ui header\"><i class=\"ui xicon globe\"></i></div>"));
                    if (symbolInfo.attributes.translationId)
                        trs.append($('<div class="ui message">').text(symbolInfo.attributes.translationId));
                    if (symbolInfo.attributes.jsDoc)
                        trs.append($('<div class="ui message">').text(symbolInfo.attributes.jsDoc));
                    trs.insertAfter(c);
                }
                fillWithWidget(options, c, js, py, s, r, { showJs: true, showPy: true, hideGutter: true });
            }, { package: options.package, snippetMode: true, aspectRatio: options.blocksAspectRatio, jres: options.jres });
        }
        function renderBlocksAsync(options) {
            return renderNextSnippetAsync(options.blocksClass, function (c, r) {
                var s = r.blocksSvg;
                if (options.snippetReplaceParent)
                    c = c.parent();
                var segment = $('<div class="ui segment codewidget"/>').append(s);
                c.replaceWith(segment);
            }, { package: options.package, snippetMode: true, aspectRatio: options.blocksAspectRatio, jres: options.jres });
        }
        function renderStaticPythonAsync(options) {
            // Highlight python snippets if the snippet has compile python
            var woptions = {
                showEdit: !!options.showEdit,
                run: !!options.simulator
            };
            return renderNextSnippetAsync(options.staticPythonClass, function (c, r) {
                var s = r.compilePython;
                if (s && s.success) {
                    var $js = c.clone().removeClass('lang-shadow').addClass('highlight');
                    var $py = $js.clone().addClass('lang-python').text(s.outfiles["main.py"]);
                    $js.addClass('lang-typescript');
                    highlight($py);
                    fillWithWidget(options, c.parent(), /* js */ $js, /* py */ $py, /* svg */ undefined, r, woptions);
                }
            }, { package: options.package, snippetMode: true, jres: options.jres });
        }
        function renderBlocksXmlAsync(opts) {
            if (!opts.blocksXmlClass)
                return Promise.resolve();
            var cls = opts.blocksXmlClass;
            function renderNextXmlAsync(cls, render, options) {
                var $el = $("." + cls).first();
                if (!$el[0])
                    return Promise.resolve();
                if (!options.emPixels)
                    options.emPixels = 18;
                options.splitSvg = true;
                return pxt.runner.compileBlocksAsync($el.text(), options)
                    .then(function (r) {
                    try {
                        render($el, r);
                    }
                    catch (e) {
                        pxt.reportException(e);
                        $el.append($('<div/>').addClass("ui segment warning").text(e.message));
                    }
                    $el.removeClass(cls);
                    return Promise.delay(1, renderNextXmlAsync(cls, render, options));
                });
            }
            return renderNextXmlAsync(cls, function (c, r) {
                var s = r.blocksSvg;
                if (opts.snippetReplaceParent)
                    c = c.parent();
                var segment = $('<div class="ui segment codewidget"/>').append(s);
                c.replaceWith(segment);
            }, { package: opts.package, snippetMode: true, aspectRatio: opts.blocksAspectRatio, jres: opts.jres });
        }
        function renderDiffBlocksXmlAsync(opts) {
            if (!opts.diffBlocksXmlClass)
                return Promise.resolve();
            var cls = opts.diffBlocksXmlClass;
            function renderNextXmlAsync(cls, render, options) {
                var $el = $("." + cls).first();
                if (!$el[0])
                    return Promise.resolve();
                if (!options.emPixels)
                    options.emPixels = 18;
                options.splitSvg = true;
                var xml = $el.text().split(/-{10,}/);
                var oldXml = xml[0];
                var newXml = xml[1];
                return pxt.runner.compileBlocksAsync("", options) // force loading blocks
                    .then(function (r) {
                    $el.removeClass(cls);
                    try {
                        var diff_1 = pxt.blocks.diffXml(oldXml, newXml);
                        if (!diff_1)
                            $el.text("no changes");
                        else {
                            r.blocksSvg = diff_1.svg;
                            render($el, r);
                        }
                    }
                    catch (e) {
                        pxt.reportException(e);
                        $el.append($('<div/>').addClass("ui segment warning").text(e.message));
                    }
                    return Promise.delay(1, renderNextXmlAsync(cls, render, options));
                });
            }
            return renderNextXmlAsync(cls, function (c, r) {
                var s = r.blocksSvg;
                if (opts.snippetReplaceParent)
                    c = c.parent();
                var segment = $('<div class="ui segment codewidget"/>').append(s);
                c.replaceWith(segment);
            }, { package: opts.package, snippetMode: true, aspectRatio: opts.blocksAspectRatio, jres: opts.jres });
        }
        function renderDiffAsync(opts) {
            if (!opts.diffClass)
                return Promise.resolve();
            var cls = opts.diffClass;
            function renderNextDiffAsync(cls) {
                var $el = $("." + cls).first();
                if (!$el[0])
                    return Promise.resolve();
                var _a = pxt.diff.split($el.text()), oldSrc = _a.fileA, newSrc = _a.fileB;
                try {
                    var diffEl = pxt.diff.render(oldSrc, newSrc, {
                        hideLineNumbers: true,
                        hideMarkerLine: true,
                        hideMarker: true,
                        hideRemoved: true,
                        update: true,
                        ignoreWhitespace: true,
                    });
                    if (opts.snippetReplaceParent)
                        $el = $el.parent();
                    var segment = $('<div class="ui segment codewidget"/>').append(diffEl);
                    $el.removeClass(cls);
                    $el.replaceWith(segment);
                }
                catch (e) {
                    pxt.reportException(e);
                    $el.append($('<div/>').addClass("ui segment warning").text(e.message));
                }
                return Promise.delay(1, renderNextDiffAsync(cls));
            }
            return renderNextDiffAsync(cls);
        }
        function renderDiffBlocksAsync(opts) {
            if (!opts.diffBlocksClass)
                return Promise.resolve();
            var cls = opts.diffBlocksClass;
            function renderNextDiffAsync(cls) {
                var $el = $("." + cls).first();
                if (!$el[0])
                    return Promise.resolve();
                var _a = pxt.diff.split($el.text(), {
                    removeTrailingSemiColumns: true
                }), oldSrc = _a.fileA, newSrc = _a.fileB;
                return Promise.mapSeries([oldSrc, newSrc], function (src) { return pxt.runner.decompileSnippetAsync(src, {
                    generateSourceMap: true
                }); })
                    .then(function (resps) {
                    try {
                        var diffBlocks = pxt.blocks.decompiledDiffAsync(oldSrc, resps[0].compileBlocks, newSrc, resps[1].compileBlocks, {
                            hideDeletedTopBlocks: true,
                            hideDeletedBlocks: true
                        });
                        var diffJs = pxt.diff.render(oldSrc, newSrc, {
                            hideLineNumbers: true,
                            hideMarkerLine: true,
                            hideMarker: true,
                            hideRemoved: true,
                            update: true,
                            ignoreWhitespace: true
                        });
                        var diffPy = void 0;
                        var _a = resps.map(function (resp) {
                            return resp.compilePython
                                && resp.compilePython.outfiles
                                && resp.compilePython.outfiles["main.py"];
                        }), oldPy = _a[0], newPy = _a[1];
                        if (oldPy && newPy) {
                            diffPy = pxt.diff.render(oldPy, newPy, {
                                hideLineNumbers: true,
                                hideMarkerLine: true,
                                hideMarker: true,
                                hideRemoved: true,
                                update: true,
                                ignoreWhitespace: true
                            });
                        }
                        fillWithWidget(opts, $el.parent(), $(diffJs), diffPy && $(diffPy), $(diffBlocks.svg), undefined, {
                            showEdit: false,
                            run: false,
                            hexname: undefined,
                            hex: undefined
                        });
                    }
                    catch (e) {
                        pxt.reportException(e);
                        $el.append($('<div/>').addClass("ui segment warning").text(e.message));
                    }
                    return Promise.delay(1, renderNextDiffAsync(cls));
                });
            }
            return renderNextDiffAsync(cls);
        }
        var decompileApiPromise;
        function decompileApiAsync(options) {
            if (!decompileApiPromise)
                decompileApiPromise = pxt.runner.decompileSnippetAsync('', options);
            return decompileApiPromise;
        }
        function renderNamespaces(options) {
            if (pxt.appTarget.id == "core")
                return Promise.resolve();
            return decompileApiAsync(options)
                .then(function (r) {
                var res = {};
                var info = r.compileBlocks.blocksInfo;
                info.blocks.forEach(function (fn) {
                    var ns = (fn.attributes.blockNamespace || fn.namespace).split('.')[0];
                    if (!res[ns]) {
                        var nsn = info.apis.byQName[ns];
                        if (nsn && nsn.attributes.color)
                            res[ns] = nsn.attributes.color;
                    }
                });
                var nsStyleBuffer = '';
                Object.keys(res).forEach(function (ns) {
                    var color = res[ns] || '#dddddd';
                    nsStyleBuffer += "\n                        span.docs." + ns.toLowerCase() + " {\n                            background-color: " + color + " !important;\n                            border-color: " + pxt.toolbox.fadeColor(color, 0.1, false) + " !important;\n                        }\n                    ";
                });
                return nsStyleBuffer;
            })
                .then(function (nsStyleBuffer) {
                Object.keys(pxt.toolbox.blockColors).forEach(function (ns) {
                    var color = pxt.toolbox.getNamespaceColor(ns);
                    nsStyleBuffer += "\n                        span.docs." + ns.toLowerCase() + " {\n                            background-color: " + color + " !important;\n                            border-color: " + pxt.toolbox.fadeColor(color, 0.1, false) + " !important;\n                        }\n                    ";
                });
                return nsStyleBuffer;
            })
                .then(function (nsStyleBuffer) {
                // Inject css
                var nsStyle = document.createElement('style');
                nsStyle.id = "namespaceColors";
                nsStyle.type = 'text/css';
                var head = document.head || document.getElementsByTagName('head')[0];
                head.appendChild(nsStyle);
                nsStyle.appendChild(document.createTextNode(nsStyleBuffer));
            });
        }
        function renderInlineBlocksAsync(options) {
            options = pxt.Util.clone(options);
            options.emPixels = 18;
            options.snippetMode = true;
            var $els = $(":not(pre) > code");
            var i = 0;
            function renderNextAsync() {
                if (i >= $els.length)
                    return Promise.resolve();
                var $el = $($els[i++]);
                var text = $el.text();
                var mbtn = /^(\|+)([^\|]+)\|+$/.exec(text);
                if (mbtn) {
                    var mtxt = /^(([^\:\.]*?)[\:\.])?(.*)$/.exec(mbtn[2]);
                    var ns = mtxt[2] ? mtxt[2].trim().toLowerCase() : '';
                    var lev = mbtn[1].length == 1 ? "docs inlinebutton " + ns : "docs inlineblock " + ns;
                    var txt = mtxt[3].trim();
                    $el.replaceWith($("<span class=\"" + lev + "\"/>").text(pxt.U.rlf(txt)));
                    return renderNextAsync();
                }
                var m = /^\[([^\]]+)\]$/.exec(text);
                if (!m)
                    return renderNextAsync();
                var code = m[1];
                return pxt.runner.decompileSnippetAsync(code, options)
                    .then(function (r) {
                    if (r.blocksSvg) {
                        var $newel = $('<span class="block"/>').append(r.blocksSvg);
                        var file = r.compileProgram.getSourceFile("main.ts");
                        var stmt = file.statements[0];
                        var info = decompileCallInfo(stmt);
                        if (info && r.apiInfo) {
                            var symbolInfo = r.apiInfo.byQName[info.qName];
                            if (symbolInfo && symbolInfo.attributes.help) {
                                $newel = $("<a class=\"ui link\"/>").attr("href", "/reference/" + symbolInfo.attributes.help).append($newel);
                            }
                        }
                        $el.replaceWith($newel);
                    }
                    return Promise.delay(1, renderNextAsync());
                });
            }
            return renderNextAsync();
        }
        function renderProjectAsync(options) {
            if (!options.projectClass)
                return Promise.resolve();
            function render() {
                var $el = $("." + options.projectClass).first();
                var e = $el[0];
                if (!e)
                    return Promise.resolve();
                $el.removeClass(options.projectClass);
                var id = pxt.Cloud.parseScriptId(e.innerText);
                if (id) {
                    if (options.snippetReplaceParent) {
                        e = e.parentElement;
                        // create a new div to host the rendered code
                        var d = document.createElement("div");
                        e.parentElement.insertBefore(d, e);
                        e.parentElement.removeChild(e);
                        e = d;
                    }
                    return pxt.runner.renderProjectAsync(e, id)
                        .then(function () { return render(); });
                }
                else
                    return render();
            }
            return render();
        }
        function renderApisAsync(options, replaceParent) {
            var cls = options.apisClass;
            if (!cls)
                return Promise.resolve();
            var apisEl = $('.' + cls);
            if (!apisEl.length)
                return Promise.resolve();
            return decompileApiAsync(options)
                .then(function (r) {
                var info = r.compileBlocks.blocksInfo;
                var symbols = pxt.Util.values(info.apis.byQName)
                    .filter(function (symbol) { return !symbol.attributes.hidden && !!symbol.attributes.jsDoc && !/^__/.test(symbol.name); });
                apisEl.each(function (i, e) {
                    var c = $(e);
                    var namespaces = pxt.Util.toDictionary(c.text().split('\n'), function (n) { return n; }); // list of namespace to list apis for.
                    var csymbols = symbols.filter(function (symbol) { return !!namespaces[symbol.namespace]; });
                    if (!csymbols.length)
                        return;
                    csymbols.sort(function (l, r) {
                        // render cards first
                        var lcard = !l.attributes.blockHidden && Blockly.Blocks[l.attributes.blockId];
                        var rcard = !r.attributes.blockHidden && Blockly.Blocks[r.attributes.blockId];
                        if (!!lcard != !!rcard)
                            return -(lcard ? 1 : 0) + (rcard ? 1 : 0);
                        // sort alphabetically
                        return l.name.localeCompare(r.name);
                    });
                    var ul = $('<div />').addClass('ui divided items');
                    ul.attr("role", "listbox");
                    csymbols.forEach(function (symbol) { return addSymbolCardItem(ul, symbol, "item"); });
                    if (replaceParent)
                        c = c.parent();
                    c.replaceWith(ul);
                });
            });
        }
        function addCardItem(ul, card) {
            if (!card)
                return;
            var mC = /^\/(v\d+)/.exec(card.url);
            var mP = /^\/(v\d+)/.exec(window.location.pathname);
            var inEditor = /#doc/i.test(window.location.href);
            if (card.url && !mC && mP && !inEditor)
                card.url = "/" + mP[1] + "/" + card.url;
            ul.append(pxt.docs.codeCard.render(card, { hideHeader: true, shortName: true }));
        }
        function addSymbolCardItem(ul, symbol, cardStyle) {
            var _a;
            var attributes = symbol.attributes;
            var block = !attributes.blockHidden && Blockly.Blocks[attributes.blockId];
            var card = (_a = block) === null || _a === void 0 ? void 0 : _a.codeCard;
            if (card) {
                var ccard = pxt.U.clone(block.codeCard);
                if (cardStyle)
                    ccard.style = cardStyle;
                addCardItem(ul, ccard);
            }
            else {
                // default to text
                // no block available here
                addCardItem(ul, {
                    name: symbol.qName,
                    description: attributes.jsDoc,
                    url: attributes.help || undefined,
                    style: cardStyle
                });
            }
        }
        function renderLinksAsync(options, cls, replaceParent, ns) {
            return renderNextSnippetAsync(cls, function (c, r) {
                var cjs = r.compileProgram;
                if (!cjs)
                    return;
                var file = cjs.getSourceFile("main.ts");
                var stmts = file.statements.slice(0);
                var ul = $('<div />').addClass('ui cards');
                ul.attr("role", "listbox");
                stmts.forEach(function (stmt) {
                    var kind = stmt.kind;
                    var info = decompileCallInfo(stmt);
                    if (info && r.apiInfo && r.apiInfo.byQName[info.qName]) {
                        var symbol = r.apiInfo.byQName[info.qName];
                        var attributes = symbol.attributes;
                        var block = Blockly.Blocks[attributes.blockId];
                        if (ns) {
                            var ii = symbol;
                            var nsi = r.compileBlocks.blocksInfo.apis.byQName[ii.namespace];
                            addCardItem(ul, {
                                name: nsi.attributes.blockNamespace || nsi.name,
                                url: nsi.attributes.help || ("reference/" + (nsi.attributes.blockNamespace || nsi.name).toLowerCase()),
                                description: nsi.attributes.jsDoc,
                                blocksXml: block && block.codeCard
                                    ? block.codeCard.blocksXml
                                    : attributes.blockId
                                        ? "<xml xmlns=\"http://www.w3.org/1999/xhtml\"><block type=\"" + attributes.blockId + "\"></block></xml>"
                                        : undefined
                            });
                        }
                        else {
                            addSymbolCardItem(ul, symbol);
                        }
                    }
                    else
                        switch (kind) {
                            case ts.SyntaxKind.ExpressionStatement: {
                                var es = stmt;
                                switch (es.expression.kind) {
                                    case ts.SyntaxKind.TrueKeyword:
                                    case ts.SyntaxKind.FalseKeyword:
                                        addCardItem(ul, {
                                            name: "Boolean",
                                            url: "blocks/logic/boolean",
                                            description: lf("True or false values"),
                                            blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="logic_boolean"><field name="BOOL">TRUE</field></block></xml>'
                                        });
                                        break;
                                    default:
                                        pxt.debug("card expr kind: " + es.expression.kind);
                                        break;
                                }
                                break;
                            }
                            case ts.SyntaxKind.IfStatement:
                                addCardItem(ul, {
                                    name: ns ? "Logic" : "if",
                                    url: "blocks/logic" + (ns ? "" : "/if"),
                                    description: ns ? lf("Logic operators and constants") : lf("Conditional statement"),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="controls_if"></block></xml>'
                                });
                                break;
                            case ts.SyntaxKind.WhileStatement:
                                addCardItem(ul, {
                                    name: ns ? "Loops" : "while",
                                    url: "blocks/loops" + (ns ? "" : "/while"),
                                    description: ns ? lf("Loops and repetition") : lf("Repeat code while a condition is true."),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="device_while"></block></xml>'
                                });
                                break;
                            case ts.SyntaxKind.ForOfStatement:
                                addCardItem(ul, {
                                    name: ns ? "Loops" : "for of",
                                    url: "blocks/loops" + (ns ? "" : "/for-of"),
                                    description: ns ? lf("Loops and repetition") : lf("Repeat code for each item in a list."),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="controls_for_of"></block></xml>'
                                });
                                break;
                            case ts.SyntaxKind.BreakStatement:
                                addCardItem(ul, {
                                    name: ns ? "Loops" : "break",
                                    url: "blocks/loops" + (ns ? "" : "/break"),
                                    description: ns ? lf("Loops and repetition") : lf("Break out of the current loop."),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="break_keyword"></block></xml>'
                                });
                                break;
                            case ts.SyntaxKind.ContinueStatement:
                                addCardItem(ul, {
                                    name: ns ? "Loops" : "continue",
                                    url: "blocks/loops" + (ns ? "" : "/continue"),
                                    description: ns ? lf("Loops and repetition") : lf("Skip iteration and continue the current loop."),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="continue_keyboard"></block></xml>'
                                });
                                break;
                            case ts.SyntaxKind.ForStatement: {
                                var fs = stmt;
                                // look for the 'repeat' loop style signature in the condition expression, explicitly: (let i = 0; i < X; i++)
                                // for loops will have the '<=' conditional.
                                var forloop = true;
                                if (fs.condition.getChildCount() == 3) {
                                    forloop = !(fs.condition.getChildAt(0).getText() == "0" ||
                                        fs.condition.getChildAt(1).kind == ts.SyntaxKind.LessThanToken);
                                }
                                if (forloop) {
                                    addCardItem(ul, {
                                        name: ns ? "Loops" : "for",
                                        url: "blocks/loops" + (ns ? "" : "/for"),
                                        description: ns ? lf("Loops and repetition") : lf("Repeat code for a given number of times using an index."),
                                        blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="controls_simple_for"></block></xml>'
                                    });
                                }
                                else {
                                    addCardItem(ul, {
                                        name: ns ? "Loops" : "repeat",
                                        url: "blocks/loops" + (ns ? "" : "/repeat"),
                                        description: ns ? lf("Loops and repetition") : lf("Repeat code for a given number of times."),
                                        blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="controls_repeat_ext"></block></xml>'
                                    });
                                }
                                break;
                            }
                            case ts.SyntaxKind.VariableStatement:
                                addCardItem(ul, {
                                    name: ns ? "Variables" : "variable declaration",
                                    url: "blocks/variables" + (ns ? "" : "/assign"),
                                    description: ns ? lf("Variables") : lf("Assign a value to a named variable."),
                                    blocksXml: '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="variables_set"></block></xml>'
                                });
                                break;
                            default:
                                pxt.debug("card kind: " + kind);
                        }
                });
                if (replaceParent)
                    c = c.parent();
                c.replaceWith(ul);
            }, { package: options.package, aspectRatio: options.blocksAspectRatio, jres: options.jres });
        }
        function fillCodeCardAsync(c, cards, options) {
            if (!cards || cards.length == 0)
                return Promise.resolve();
            if (cards.length == 0) {
                var cc = pxt.docs.codeCard.render(cards[0], options);
                c.replaceWith(cc);
            }
            else {
                var cd_1 = document.createElement("div");
                cd_1.className = "ui cards";
                cd_1.setAttribute("role", "listbox");
                cards.forEach(function (card) {
                    // patch card url with version if necessary, we don't do this in the editor because that goes through the backend and passes the targetVersion then
                    var mC = /^\/(v\d+)/.exec(card.url);
                    var mP = /^\/(v\d+)/.exec(window.location.pathname);
                    var inEditor = /#doc/i.test(window.location.href);
                    if (card.url && !mC && mP && !inEditor)
                        card.url = "/" + mP[1] + card.url;
                    var cardEl = pxt.docs.codeCard.render(card, options);
                    cd_1.appendChild(cardEl);
                    // automitcally display package icon for approved packages
                    if (card.cardType == "package") {
                        var repoId_1 = pxt.github.parseRepoId((card.url || "").replace(/^\/pkg\//, ''));
                        if (repoId_1) {
                            pxt.packagesConfigAsync()
                                .then(function (pkgConfig) {
                                var status = pxt.github.repoStatus(repoId_1, pkgConfig);
                                switch (status) {
                                    case pxt.github.GitRepoStatus.Banned:
                                        cardEl.remove();
                                        break;
                                    case pxt.github.GitRepoStatus.Approved:
                                        // update card info
                                        card.imageUrl = pxt.github.mkRepoIconUrl(repoId_1);
                                        // inject
                                        cd_1.insertBefore(pxt.docs.codeCard.render(card, options), cardEl);
                                        cardEl.remove();
                                        break;
                                }
                            })
                                .catch(function (e) {
                                // swallow
                                pxt.reportException(e);
                                pxt.debug("failed to load repo " + card.url);
                            });
                        }
                    }
                });
                c.replaceWith(cd_1);
            }
            return Promise.resolve();
        }
        function renderNextCodeCardAsync(cls, options) {
            if (!cls)
                return Promise.resolve();
            var $el = $("." + cls).first();
            if (!$el[0])
                return Promise.resolve();
            $el.removeClass(cls);
            var cards;
            try {
                var js = JSON.parse($el.text());
                if (!Array.isArray(js))
                    js = [js];
                cards = js;
            }
            catch (e) {
                pxt.reportException(e);
                $el.append($('<div/>').addClass("ui segment warning").text(e.messageText));
            }
            if (options.snippetReplaceParent)
                $el = $el.parent();
            return fillCodeCardAsync($el, cards, { hideHeader: true })
                .then(function () { return Promise.delay(1, renderNextCodeCardAsync(cls, options)); });
        }
        function getRunUrl(options) {
            return options.pxtUrl ? options.pxtUrl + '/--run' : pxt.webConfig && pxt.webConfig.runUrl ? pxt.webConfig.runUrl : '/--run';
        }
        function getEditUrl(options) {
            var url = options.pxtUrl || pxt.appTarget.appTheme.homeUrl;
            return (url || "").replace(/\/$/, '');
        }
        function mergeConfig(options) {
            // additional config options
            if (!options.packageClass)
                return;
            $('.' + options.packageClass).each(function (i, c) {
                var $c = $(c);
                var name = $c.text().split('\n').map(function (s) { return s.replace(/\s*/g, ''); }).filter(function (s) { return !!s; }).join(',');
                options.package = options.package ? options.package + "," + name : name;
                if (options.snippetReplaceParent)
                    $c = $c.parent();
                $c.remove();
            });
            $('.lang-config').each(function (i, c) {
                var $c = $(c);
                if (options.snippetReplaceParent)
                    $c = $c.parent();
                $c.remove();
            });
        }
        function readJRes(options) {
            if (!options.jresClass)
                return;
            $('.' + options.jresClass).each(function (i, c) {
                var $c = $(c);
                options.jres = $c.text();
                $c.remove();
            });
        }
        function renderDirectPython(options) {
            // Highlight python snippets written with the ```python
            // language tag (as opposed to the ```spy tag, see renderStaticPythonAsync for that)
            var woptions = {
                showEdit: !!options.showEdit,
                run: !!options.simulator
            };
            function render(e, ignored) {
                if (typeof hljs !== "undefined") {
                    $(e).text($(e).text().replace(/^\s*\r?\n/, ''));
                    hljs.highlightBlock(e);
                    highlightLine($(e));
                }
                var opts = pxt.U.clone(woptions);
                if (ignored) {
                    opts.run = false;
                    opts.showEdit = false;
                }
                fillWithWidget(options, $(e).parent(), $(e), /* py */ undefined, /* JQuery */ undefined, /* decompileResult */ undefined, opts);
            }
            $('code.lang-python').each(function (i, e) {
                render(e, false);
                $(e).removeClass('lang-python');
            });
        }
        function renderTypeScript(options) {
            var woptions = {
                showEdit: !!options.showEdit,
                run: !!options.simulator
            };
            function render(e, ignored) {
                if (typeof hljs !== "undefined") {
                    $(e).text($(e).text().replace(/^\s*\r?\n/, ''));
                    hljs.highlightBlock(e);
                    highlightLine($(e));
                }
                var opts = pxt.U.clone(woptions);
                if (ignored) {
                    opts.run = false;
                    opts.showEdit = false;
                }
                fillWithWidget(options, $(e).parent(), $(e), /* py */ undefined, /* JQuery */ undefined, /* decompileResult */ undefined, opts);
            }
            $('code.lang-typescript').each(function (i, e) {
                render(e, false);
                $(e).removeClass('lang-typescript');
            });
            $('code.lang-typescript-ignore').each(function (i, e) {
                $(e).removeClass('lang-typescript-ignore');
                $(e).addClass('lang-typescript');
                render(e, true);
                $(e).removeClass('lang-typescript');
            });
            $('code.lang-typescript-invalid').each(function (i, e) {
                $(e).removeClass('lang-typescript-invalid');
                $(e).addClass('lang-typescript');
                render(e, true);
                $(e).removeClass('lang-typescript');
                $(e).parent('div').addClass('invalid');
                $(e).parent('div').prepend($("<i>", { "class": "icon ban" }));
                $(e).addClass('invalid');
            });
            $('code.lang-typescript-valid').each(function (i, e) {
                $(e).removeClass('lang-typescript-valid');
                $(e).addClass('lang-typescript');
                render(e, true);
                $(e).removeClass('lang-typescript');
                $(e).parent('div').addClass('valid');
                $(e).parent('div').prepend($("<i>", { "class": "icon check" }));
                $(e).addClass('valid');
            });
        }
        function renderGhost(options) {
            var c = $('code.lang-ghost');
            if (options.snippetReplaceParent)
                c = c.parent();
            c.remove();
        }
        function renderSims(options) {
            if (!options.simulatorClass)
                return;
            // simulators
            $('.' + options.simulatorClass).each(function (i, c) {
                var $c = $(c);
                var padding = '81.97%';
                if (pxt.appTarget.simulator)
                    padding = (100 / pxt.appTarget.simulator.aspectRatio) + '%';
                var $sim = $("<div class=\"ui card\"><div class=\"ui content\">\n                    <div style=\"position:relative;height:0;padding-bottom:" + padding + ";overflow:hidden;\">\n                    <iframe style=\"position:absolute;top:0;left:0;width:100%;height:100%;\" allowfullscreen=\"allowfullscreen\" frameborder=\"0\" sandbox=\"allow-popups allow-forms allow-scripts allow-same-origin\"></iframe>\n                    </div>\n                    </div></div>");
                var deps = options.package ? "&deps=" + encodeURIComponent(options.package) : "";
                var url = getRunUrl(options) + "#nofooter=1" + deps;
                var data = encodeURIComponent($c.text().trim());
                $sim.find("iframe").attr("src", url);
                $sim.find("iframe").attr("data-code", data);
                if (options.snippetReplaceParent)
                    $c = $c.parent();
                $c.replaceWith($sim);
            });
        }
        function renderAsync(options) {
            pxt.analytics.enable();
            if (!options)
                options = defaultClientRenderOptions();
            if (options.pxtUrl)
                options.pxtUrl = options.pxtUrl.replace(/\/$/, '');
            if (options.showEdit)
                options.showEdit = !pxt.BrowserUtils.isIFrame();
            mergeConfig(options);
            readJRes(options);
            renderQueue = [];
            renderGhost(options);
            renderSims(options);
            renderTypeScript(options);
            renderDirectPython(options);
            return Promise.resolve()
                .then(function () { return renderNextCodeCardAsync(options.codeCardClass, options); })
                .then(function () { return renderNamespaces(options); })
                .then(function () { return renderInlineBlocksAsync(options); })
                .then(function () { return renderLinksAsync(options, options.linksClass, options.snippetReplaceParent, false); })
                .then(function () { return renderLinksAsync(options, options.namespacesClass, options.snippetReplaceParent, true); })
                .then(function () { return renderApisAsync(options, options.snippetReplaceParent); })
                .then(function () { return renderSignaturesAsync(options); })
                .then(function () { return renderSnippetsAsync(options); })
                .then(function () { return renderBlocksAsync(options); })
                .then(function () { return renderBlocksXmlAsync(options); })
                .then(function () { return renderDiffBlocksXmlAsync(options); })
                .then(function () { return renderDiffBlocksAsync(options); })
                .then(function () { return renderDiffAsync(options); })
                .then(function () { return renderStaticPythonAsync(options); })
                .then(function () { return renderProjectAsync(options); })
                .then(function () { return consumeRenderQueueAsync(); });
        }
        runner.renderAsync = renderAsync;
    })(runner = pxt.runner || (pxt.runner = {}));
})(pxt || (pxt = {}));
/* tslint:disable:no-inner-html TODO(tslint): get rid of jquery html() calls */
/// <reference path="../built/pxtlib.d.ts" />
/// <reference path="../built/pxteditor.d.ts" />
/// <reference path="../built/pxtcompiler.d.ts" />
/// <reference path="../built/pxtblocks.d.ts" />
/// <reference path="../built/pxtsim.d.ts" />
var pxt;
(function (pxt) {
    var runner;
    (function (runner) {
        var EditorPackage = /** @class */ (function () {
            function EditorPackage(ksPkg, topPkg) {
                this.ksPkg = ksPkg;
                this.topPkg = topPkg;
                this.files = {};
            }
            EditorPackage.prototype.getKsPkg = function () {
                return this.ksPkg;
            };
            EditorPackage.prototype.getPkgId = function () {
                return this.ksPkg ? this.ksPkg.id : this.id;
            };
            EditorPackage.prototype.isTopLevel = function () {
                return this.ksPkg && this.ksPkg.level == 0;
            };
            EditorPackage.prototype.setFiles = function (files) {
                this.files = files;
            };
            EditorPackage.prototype.getAllFiles = function () {
                return pxt.Util.mapMap(this.files, function (k, f) { return f; });
            };
            return EditorPackage;
        }());
        var Host = /** @class */ (function () {
            function Host() {
                this.githubPackageCache = {};
            }
            Host.prototype.readFile = function (module, filename) {
                var epkg = getEditorPkg(module);
                return pxt.U.lookup(epkg.files, filename);
            };
            Host.prototype.writeFile = function (module, filename, contents) {
                if (filename == pxt.CONFIG_NAME)
                    return; // ignore config writes
                var epkg = getEditorPkg(module);
                epkg.files[filename] = contents;
            };
            Host.prototype.getHexInfoAsync = function (extInfo) {
                return pxt.hexloader.getHexInfoAsync(this, extInfo);
            };
            Host.prototype.cacheStoreAsync = function (id, val) {
                return Promise.resolve();
            };
            Host.prototype.cacheGetAsync = function (id) {
                return Promise.resolve(null);
            };
            Host.prototype.patchDependencies = function (cfg, name, repoId) {
                if (!repoId)
                    return false;
                // check that the same package hasn't been added yet
                var repo = pxt.github.parseRepoId(repoId);
                if (!repo)
                    return false;
                for (var _i = 0, _a = Object.keys(cfg.dependencies); _i < _a.length; _i++) {
                    var k = _a[_i];
                    var v = cfg.dependencies[k];
                    var kv = pxt.github.parseRepoId(v);
                    if (kv && repo.fullName == kv.fullName) {
                        if (pxt.semver.strcmp(repo.tag, kv.tag) < 0) {
                            // we have a later tag, use this one
                            cfg.dependencies[k] = repoId;
                        }
                        return true;
                    }
                }
                return false;
            };
            Host.prototype.downloadPackageAsync = function (pkg, dependencies) {
                var _this = this;
                var proto = pkg.verProtocol();
                var cached = undefined;
                // cache resolve github packages
                if (proto == "github")
                    cached = this.githubPackageCache[pkg._verspec];
                var epkg = getEditorPkg(pkg);
                return (cached ? Promise.resolve(cached) : pkg.commonDownloadAsync())
                    .then(function (resp) {
                    if (resp) {
                        if (proto == "github" && !cached)
                            _this.githubPackageCache[pkg._verspec] = pxt.Util.clone(resp);
                        epkg.setFiles(resp);
                        return Promise.resolve();
                    }
                    if (proto == "empty") {
                        if (Object.keys(epkg.files).length == 0) {
                            epkg.setFiles(emptyPrjFiles());
                        }
                        if (dependencies && dependencies.length) {
                            var files = getEditorPkg(pkg).files;
                            var cfg_1 = JSON.parse(files[pxt.CONFIG_NAME]);
                            dependencies.forEach(function (d) {
                                addPackageToConfig(cfg_1, d);
                            });
                            files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(cfg_1);
                        }
                        return Promise.resolve();
                    }
                    else if (proto == "docs") {
                        var files = emptyPrjFiles();
                        var cfg_2 = JSON.parse(files[pxt.CONFIG_NAME]);
                        // load all dependencies
                        pkg.verArgument().split(',').forEach(function (d) {
                            if (!addPackageToConfig(cfg_2, d)) {
                                return;
                            }
                        });
                        if (!cfg_2.yotta)
                            cfg_2.yotta = {};
                        cfg_2.yotta.ignoreConflicts = true;
                        files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(cfg_2);
                        epkg.setFiles(files);
                        return Promise.resolve();
                    }
                    else if (proto == "invalid") {
                        pxt.log("skipping invalid pkg " + pkg.id);
                        return Promise.resolve();
                    }
                    else {
                        return Promise.reject("Cannot download " + pkg.version() + "; unknown protocol");
                    }
                });
            };
            return Host;
        }());
        var tilemapProject;
        if (!pxt.react.getTilemapProject) {
            pxt.react.getTilemapProject = function () {
                if (!tilemapProject) {
                    tilemapProject = new pxt.TilemapProject();
                    tilemapProject.loadPackage(runner.mainPkg);
                }
                return tilemapProject;
            };
        }
        function addPackageToConfig(cfg, dep) {
            var m = /^([a-zA-Z0-9_-]+)(=(.+))?$/.exec(dep);
            if (m) {
                if (m[3] && this && this.patchDependencies(cfg, m[1], m[3]))
                    return false;
                cfg.dependencies[m[1]] = m[3] || "*";
            }
            else
                console.warn("unknown package syntax " + dep);
            return true;
        }
        function getEditorPkg(p) {
            var r = p._editorPkg;
            if (r)
                return r;
            var top = null;
            if (p != runner.mainPkg)
                top = getEditorPkg(runner.mainPkg);
            var newOne = new EditorPackage(p, top);
            if (p == runner.mainPkg)
                newOne.topPkg = newOne;
            p._editorPkg = newOne;
            return newOne;
        }
        function emptyPrjFiles() {
            var p = pxt.appTarget.tsprj;
            var files = pxt.U.clone(p.files);
            files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(p.config);
            files["main.blocks"] = "";
            return files;
        }
        function patchSemantic() {
            if ($ && $.fn && $.fn.embed && $.fn.embed.settings && $.fn.embed.settings.sources && $.fn.embed.settings.sources.youtube) {
                $.fn.embed.settings.sources.youtube.url = '//www.youtube.com/embed/{id}?rel=0';
            }
        }
        function initInnerAsync() {
            pxt.setAppTarget(window.pxtTargetBundle);
            pxt.Util.assert(!!pxt.appTarget);
            var href = window.location.href;
            var live = false;
            var force = false;
            var lang = undefined;
            if (/[&?]translate=1/.test(href) && !pxt.BrowserUtils.isIE()) {
                lang = ts.pxtc.Util.TRANSLATION_LOCALE;
                live = true;
                force = true;
            }
            else {
                var cookieValue = /PXT_LANG=(.*?)(?:;|$)/.exec(document.cookie);
                var mlang = /(live)?(force)?lang=([a-z]{2,}(-[A-Z]+)?)/i.exec(href);
                lang = mlang ? mlang[3] : (cookieValue && cookieValue[1] || pxt.appTarget.appTheme.defaultLocale || navigator.userLanguage || navigator.language);
                live = !pxt.appTarget.appTheme.disableLiveTranslations || (mlang && !!mlang[1]);
                force = !!mlang && !!mlang[2];
            }
            var versions = pxt.appTarget.versions;
            patchSemantic();
            var cfg = pxt.webConfig;
            return pxt.Util.updateLocalizationAsync(pxt.appTarget.id, cfg.commitCdnUrl, lang, versions ? versions.pxtCrowdinBranch : "", versions ? versions.targetCrowdinBranch : "", live, force)
                .then(function () {
                runner.mainPkg = new pxt.MainPackage(new Host());
            });
        }
        function initFooter(footer, shareId) {
            if (!footer)
                return;
            var theme = pxt.appTarget.appTheme;
            var body = $('body');
            var $footer = $(footer);
            var footera = $('<a/>').attr('href', theme.homeUrl)
                .attr('target', '_blank');
            $footer.append(footera);
            if (theme.organizationLogo)
                footera.append($('<img/>').attr('src', pxt.Util.toDataUri(theme.organizationLogo)));
            else
                footera.append(lf("powered by {0}", theme.title));
            body.mouseenter(function (ev) { return $footer.fadeOut(); });
            body.mouseleave(function (ev) { return $footer.fadeIn(); });
        }
        runner.initFooter = initFooter;
        function showError(msg) {
            console.error(msg);
        }
        runner.showError = showError;
        var previousMainPackage = undefined;
        function loadPackageAsync(id, code, dependencies) {
            var verspec = id ? /\w+:\w+/.test(id) ? id : "pub:" + id : "empty:tsprj";
            var host;
            var downloadPackagePromise;
            var installPromise;
            if (previousMainPackage && previousMainPackage._verspec == verspec) {
                runner.mainPkg = previousMainPackage;
                host = runner.mainPkg.host();
                downloadPackagePromise = Promise.resolve();
                installPromise = Promise.resolve();
            }
            else {
                host = runner.mainPkg.host();
                runner.mainPkg = new pxt.MainPackage(host);
                runner.mainPkg._verspec = id ? /\w+:\w+/.test(id) ? id : "pub:" + id : "empty:tsprj";
                downloadPackagePromise = host.downloadPackageAsync(runner.mainPkg, dependencies);
                installPromise = runner.mainPkg.installAllAsync();
                // cache previous package
                previousMainPackage = runner.mainPkg;
            }
            return downloadPackagePromise
                .then(function () { return host.readFile(runner.mainPkg, pxt.CONFIG_NAME); })
                .then(function (str) {
                if (!str)
                    return Promise.resolve();
                return installPromise.then(function () {
                    if (code) {
                        //Set the custom code if provided for docs.
                        var epkg = getEditorPkg(runner.mainPkg);
                        epkg.files["main.ts"] = code;
                        //set the custom doc name from the URL.
                        var cfg = JSON.parse(epkg.files[pxt.CONFIG_NAME]);
                        cfg.name = window.location.href.split('/').pop().split(/[?#]/)[0];
                        ;
                        epkg.files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(cfg);
                        //Propgate the change to main package
                        runner.mainPkg.config.name = cfg.name;
                        if (runner.mainPkg.config.files.indexOf("main.blocks") == -1) {
                            runner.mainPkg.config.files.push("main.blocks");
                        }
                    }
                }).catch(function (e) {
                    showError(lf("Cannot load extension: {0}", e.message));
                });
            });
        }
        function getCompileOptionsAsync(hex) {
            var trg = runner.mainPkg.getTargetOptions();
            trg.isNative = !!hex;
            trg.hasHex = !!hex;
            return runner.mainPkg.getCompileOptionsAsync(trg);
        }
        function compileAsync(hex, updateOptions) {
            return getCompileOptionsAsync(hex)
                .then(function (opts) {
                if (updateOptions)
                    updateOptions(opts);
                var resp = pxtc.compile(opts);
                if (resp.diagnostics && resp.diagnostics.length > 0) {
                    resp.diagnostics.forEach(function (diag) {
                        console.error(diag.messageText);
                    });
                }
                return resp;
            });
        }
        function generateHexFileAsync(options) {
            return loadPackageAsync(options.id)
                .then(function () { return compileAsync(true, function (opts) {
                if (options.code)
                    opts.fileSystem["main.ts"] = options.code;
            }); })
                .then(function (resp) {
                if (resp.diagnostics && resp.diagnostics.length > 0) {
                    console.error("Diagnostics", resp.diagnostics);
                }
                return resp.outfiles[pxtc.BINARY_HEX];
            });
        }
        runner.generateHexFileAsync = generateHexFileAsync;
        function generateVMFileAsync(options) {
            pxt.setHwVariant("vm");
            return loadPackageAsync(options.id)
                .then(function () { return compileAsync(true, function (opts) {
                if (options.code)
                    opts.fileSystem["main.ts"] = options.code;
            }); })
                .then(function (resp) {
                console.log(resp);
                return resp;
            });
        }
        runner.generateVMFileAsync = generateVMFileAsync;
        function simulateAsync(container, simOptions) {
            return loadPackageAsync(simOptions.id, simOptions.code, simOptions.dependencies)
                .then(function () { return compileAsync(false, function (opts) {
                if (simOptions.code)
                    opts.fileSystem["main.ts"] = simOptions.code;
            }); })
                .then(function (resp) {
                if (resp.diagnostics && resp.diagnostics.length > 0) {
                    console.error("Diagnostics", resp.diagnostics);
                }
                var js = resp.outfiles[pxtc.BINARY_JS];
                if (js) {
                    var options_1 = {};
                    options_1.onSimulatorCommand = function (msg) {
                        if (msg.command === "restart") {
                            runOptions_1.storedState = getStoredState(simOptions.id);
                            driver_1.run(js, runOptions_1);
                        }
                        if (msg.command == "setstate") {
                            if (msg.stateKey && msg.stateValue) {
                                setStoredState(simOptions.id, msg.stateKey, msg.stateValue);
                            }
                        }
                    };
                    var driver_1 = new pxsim.SimulatorDriver(container, options_1);
                    var fnArgs = resp.usedArguments;
                    var board = pxt.appTarget.simulator.boardDefinition;
                    var parts = pxtc.computeUsedParts(resp, true);
                    var storedState = getStoredState(simOptions.id);
                    var runOptions_1 = {
                        boardDefinition: board,
                        parts: parts,
                        fnArgs: fnArgs,
                        cdnUrl: pxt.webConfig.commitCdnUrl,
                        localizedStrings: pxt.Util.getLocalizedStrings(),
                        highContrast: simOptions.highContrast,
                        storedState: storedState,
                        light: simOptions.light
                    };
                    if (pxt.appTarget.simulator && !simOptions.fullScreen)
                        runOptions_1.aspectRatio = parts.length && pxt.appTarget.simulator.partsAspectRatio
                            ? pxt.appTarget.simulator.partsAspectRatio
                            : pxt.appTarget.simulator.aspectRatio;
                    driver_1.run(js, runOptions_1);
                }
            });
        }
        runner.simulateAsync = simulateAsync;
        function getStoredState(id) {
            var storedState = {};
            try {
                var projectStorage = window.localStorage.getItem(id);
                if (projectStorage) {
                    storedState = JSON.parse(projectStorage);
                }
            }
            catch (e) { }
            return storedState;
        }
        function setStoredState(id, key, value) {
            var storedState = getStoredState(id);
            if (!id) {
                return;
            }
            if (value)
                storedState[key] = value;
            else
                delete storedState[key];
            try {
                window.localStorage.setItem(id, JSON.stringify(storedState));
            }
            catch (e) { }
        }
        var LanguageMode;
        (function (LanguageMode) {
            LanguageMode[LanguageMode["Blocks"] = 0] = "Blocks";
            LanguageMode[LanguageMode["TypeScript"] = 1] = "TypeScript";
        })(LanguageMode = runner.LanguageMode || (runner.LanguageMode = {}));
        runner.editorLanguageMode = LanguageMode.Blocks;
        function setEditorContextAsync(mode, localeInfo) {
            runner.editorLanguageMode = mode;
            if (localeInfo != pxt.Util.localeInfo()) {
                var localeLiveRx = /^live-/;
                return pxt.Util.updateLocalizationAsync(pxt.appTarget.id, pxt.webConfig.commitCdnUrl, localeInfo.replace(localeLiveRx, ''), pxt.appTarget.versions.pxtCrowdinBranch, pxt.appTarget.versions.targetCrowdinBranch, localeLiveRx.test(localeInfo));
            }
            return Promise.resolve();
        }
        runner.setEditorContextAsync = setEditorContextAsync;
        function receiveDocMessage(e) {
            var m = e.data;
            if (!m)
                return;
            switch (m.type) {
                case "fileloaded":
                    var fm = m;
                    var name_1 = fm.name;
                    setEditorContextAsync(/\.ts$/i.test(name_1) ? LanguageMode.TypeScript : LanguageMode.Blocks, fm.locale).done();
                    break;
                case "popout":
                    var mp = /((\/v[0-9+])\/)?[^\/]*#(doc|md):([^&?:]+)/i.exec(window.location.href);
                    if (mp) {
                        var docsUrl = pxt.webConfig.docsUrl || '/--docs';
                        var verPrefix = mp[2] || '';
                        var url = mp[3] == "doc" ? (pxt.webConfig.isStatic ? "/docs" + mp[4] + ".html" : "" + mp[4]) : docsUrl + "?md=" + mp[4];
                        // notify parent iframe that we have completed the popout
                        if (window.parent)
                            window.parent.postMessage({
                                type: "opendoc",
                                url: pxt.BrowserUtils.urlJoin(verPrefix, url)
                            }, "*");
                    }
                    break;
                case "localtoken":
                    var dm = m;
                    if (dm && dm.localToken) {
                        pxt.Cloud.localToken = dm.localToken;
                        pendingLocalToken.forEach(function (p) { return p(); });
                        pendingLocalToken = [];
                    }
                    break;
            }
        }
        function startRenderServer() {
            pxt.tickEvent("renderer.ready");
            var jobQueue = [];
            var jobPromise = undefined;
            function consumeQueue() {
                if (jobPromise)
                    return; // other worker already in action
                var msg = jobQueue.shift();
                if (!msg)
                    return; // no more work
                var options = (msg.options || {});
                options.splitSvg = false; // don't split when requesting rendered images
                pxt.tickEvent("renderer.job");
                var isXml = /^\s*<xml/.test(msg.code);
                jobPromise = pxt.BrowserUtils.loadBlocklyAsync()
                    .then(function () { return isXml ? pxt.runner.compileBlocksAsync(msg.code, options) : runner.decompileSnippetAsync(msg.code, msg.options); })
                    .then(function (result) {
                    var blocksSvg = result.blocksSvg;
                    return blocksSvg ? pxt.blocks.layout.blocklyToSvgAsync(blocksSvg, 0, 0, blocksSvg.viewBox.baseVal.width, blocksSvg.viewBox.baseVal.height) : undefined;
                }).then(function (res) {
                    window.parent.postMessage({
                        source: "makecode",
                        type: "renderblocks",
                        id: msg.id,
                        width: res ? res.width : undefined,
                        height: res ? res.height : undefined,
                        svg: res ? res.svg : undefined,
                        uri: res ? res.xml : undefined,
                        css: res ? res.css : undefined
                    }, "*");
                })
                    .catch(function (e) {
                    window.parent.postMessage({
                        source: "makecode",
                        type: "renderblocks",
                        id: msg.id,
                        error: e.message
                    }, "*");
                })
                    .finally(function () {
                    jobPromise = undefined;
                    consumeQueue();
                });
            }
            pxt.editor.initEditorExtensionsAsync()
                .done(function () {
                // notify parent that render engine is loaded
                window.addEventListener("message", function (ev) {
                    var msg = ev.data;
                    if (msg.type == "renderblocks") {
                        jobQueue.push(msg);
                        consumeQueue();
                    }
                }, false);
                window.parent.postMessage({
                    source: "makecode",
                    type: "renderready"
                }, "*");
            });
        }
        runner.startRenderServer = startRenderServer;
        function startDocsServer(loading, content, backButton) {
            pxt.tickEvent("docrenderer.ready");
            var history = [];
            if (backButton) {
                backButton.addEventListener("click", function () {
                    goBack();
                });
                setElementDisabled(backButton, true);
            }
            function render(doctype, src) {
                pxt.debug("rendering " + doctype);
                if (backButton)
                    $(backButton).hide();
                $(content).hide();
                $(loading).show();
                Promise.delay(100) // allow UI to update
                    .then(function () {
                    switch (doctype) {
                        case "print":
                            var data = window.localStorage["printjob"];
                            delete window.localStorage["printjob"];
                            return renderProjectFilesAsync(content, JSON.parse(data), undefined, true)
                                .then(function () { return pxsim.print(1000); });
                        case "project":
                            return renderProjectFilesAsync(content, JSON.parse(src))
                                .then(function () { return pxsim.print(1000); });
                        case "projectid":
                            return renderProjectAsync(content, JSON.parse(src))
                                .then(function () { return pxsim.print(1000); });
                        case "doc":
                            return renderDocAsync(content, src);
                        case "book":
                            return renderBookAsync(content, src);
                        default:
                            return renderMarkdownAsync(content, src);
                    }
                })
                    .catch(function (e) {
                    $(content).html("\n                    <img style=\"height:4em;\" src=\"" + pxt.appTarget.appTheme.docsLogo + "\" />\n                    <h1>" + lf("Oops") + "</h1>\n                    <h3>" + lf("We could not load the documentation, please check your internet connection.") + "</h3>\n                    <button class=\"ui button primary\" id=\"tryagain\">" + lf("Try Again") + "</button>");
                    $(content).find('#tryagain').click(function () {
                        render(doctype, src);
                    });
                    // notify parent iframe that docs weren't loaded
                    if (window.parent)
                        window.parent.postMessage({
                            type: "docfailed",
                            docType: doctype,
                            src: src
                        }, "*");
                }).finally(function () {
                    $(loading).hide();
                    if (backButton)
                        $(backButton).show();
                    $(content).show();
                })
                    .done(function () { });
            }
            function pushHistory() {
                if (!backButton)
                    return;
                history.push(window.location.hash);
                if (history.length > 10) {
                    history.shift();
                }
                if (history.length > 1) {
                    setElementDisabled(backButton, false);
                }
            }
            function goBack() {
                if (!backButton)
                    return;
                if (history.length > 1) {
                    // Top is current page
                    history.pop();
                    window.location.hash = history.pop();
                }
                if (history.length <= 1) {
                    setElementDisabled(backButton, true);
                }
            }
            function setElementDisabled(el, disabled) {
                if (disabled) {
                    pxsim.U.addClass(el, "disabled");
                    el.setAttribute("aria-disabled", "true");
                }
                else {
                    pxsim.U.removeClass(el, "disabled");
                    el.setAttribute("aria-disabled", "false");
                }
            }
            function renderHash() {
                var m = /^#(doc|md|tutorial|book|project|projectid|print):([^&?:]+)(:([^&?:]+):([^&?:]+))?/i.exec(window.location.hash);
                if (m) {
                    pushHistory();
                    // navigation occured
                    var p = m[4] ? setEditorContextAsync(/^blocks$/.test(m[4]) ? LanguageMode.Blocks : LanguageMode.TypeScript, m[5]) : Promise.resolve();
                    p.then(function () { return render(m[1], decodeURIComponent(m[2])); });
                }
            }
            var promise = pxt.editor.initEditorExtensionsAsync();
            promise.done(function () {
                window.addEventListener("message", receiveDocMessage, false);
                window.addEventListener("hashchange", function () {
                    renderHash();
                }, false);
                parent.postMessage({ type: "sidedocready" }, "*");
                // delay load doc page to allow simulator to load first
                setTimeout(function () { return renderHash(); }, 1);
            });
        }
        runner.startDocsServer = startDocsServer;
        function renderProjectAsync(content, projectid) {
            return pxt.Cloud.privateGetTextAsync(projectid + "/text")
                .then(function (txt) { return JSON.parse(txt); })
                .then(function (files) { return renderProjectFilesAsync(content, files, projectid); });
        }
        runner.renderProjectAsync = renderProjectAsync;
        function renderProjectFilesAsync(content, files, projectid, escapeLinks) {
            if (projectid === void 0) { projectid = null; }
            if (escapeLinks === void 0) { escapeLinks = false; }
            var cfg = (JSON.parse(files[pxt.CONFIG_NAME]) || {});
            var md = "# " + cfg.name + " " + (cfg.version ? cfg.version : '') + "\n\n";
            var readme = "README.md";
            if (files[readme])
                md += files[readme].replace(/^#+/, "$0#") + '\n'; // bump all headers down 1
            cfg.files.filter(function (f) { return f != pxt.CONFIG_NAME && f != readme; })
                .filter(function (f) { return (runner.editorLanguageMode == LanguageMode.Blocks) == /\.blocks?$/.test(f); })
                .forEach(function (f) {
                if (!/^main\.(ts|blocks)$/.test(f))
                    md += "\n## " + f + "\n";
                if (/\.ts$/.test(f)) {
                    md += "```typescript\n" + files[f] + "\n```\n";
                }
                else if (/\.blocks?$/.test(f)) {
                    md += "```blocksxml\n" + files[f] + "\n```\n";
                }
                else {
                    md += "```" + f.substr(f.indexOf('.')) + "\n" + files[f] + "\n```\n";
                }
            });
            var deps = cfg && cfg.dependencies && Object.keys(cfg.dependencies).filter(function (k) { return k != pxt.appTarget.corepkg; });
            if (deps && deps.length) {
                md += "\n## " + lf("Extensions") + " #extensions\n\n" + deps.map(function (k) { return "* " + k + ", " + cfg.dependencies[k]; }).join('\n') + "\n\n```package\n" + deps.map(function (k) { return k + "=" + cfg.dependencies[k]; }).join('\n') + "\n```\n";
            }
            if (projectid) {
                var linkString = (pxt.appTarget.appTheme.shareUrl || "https://makecode.com/") + projectid;
                if (escapeLinks) {
                    // If printing the link will show up twice if it's an actual link
                    linkString = "`" + linkString + "`";
                }
                md += "\n" + linkString + "\n\n";
            }
            console.debug("print md: " + md);
            var options = {
                print: true
            };
            return renderMarkdownAsync(content, md, options);
        }
        runner.renderProjectFilesAsync = renderProjectFilesAsync;
        function renderDocAsync(content, docid) {
            docid = docid.replace(/^\//, "");
            return pxt.Cloud.markdownAsync(docid)
                .then(function (md) { return renderMarkdownAsync(content, md, { path: docid }); });
        }
        function renderBookAsync(content, summaryid) {
            summaryid = summaryid.replace(/^\//, "");
            pxt.tickEvent('book', { id: summaryid });
            pxt.log("rendering book from " + summaryid);
            // display loader
            var $loader = $("#loading").find(".loader");
            $loader.addClass("text").text(lf("Compiling your book (this may take a minute)"));
            // start the work
            var toc;
            return Promise.delay(100)
                .then(function () { return pxt.Cloud.markdownAsync(summaryid); })
                .then(function (summary) {
                toc = pxt.docs.buildTOC(summary);
                pxt.log("TOC: " + JSON.stringify(toc, null, 2));
                var tocsp = [];
                pxt.docs.visitTOC(toc, function (entry) {
                    if (!/^\//.test(entry.path) || /^\/pkg\//.test(entry.path))
                        return;
                    tocsp.push(pxt.Cloud.markdownAsync(entry.path)
                        .then(function (md) {
                        entry.markdown = md;
                    }, function (e) {
                        entry.markdown = "_" + entry.path + " failed to load._";
                    }));
                });
                return Promise.all(tocsp);
            })
                .then(function (pages) {
                var md = toc[0].name;
                pxt.docs.visitTOC(toc, function (entry) {
                    if (entry.markdown)
                        md += '\n\n' + entry.markdown;
                });
                return renderMarkdownAsync(content, md);
            });
        }
        var template = "\n<aside id=button class=box>\n   <a class=\"ui primary button\" href=\"@ARGS@\">@BODY@</a>\n</aside>\n\n<aside id=vimeo>\n<div class=\"ui two column stackable grid container\">\n<div class=\"column\">\n    <div class=\"ui embed mdvid\" data-source=\"vimeo\" data-id=\"@ARGS@\" data-placeholder=\"/thumbnail/1024/vimeo/@ARGS@\" data-icon=\"video play\">\n    </div>\n</div></div>\n</aside>\n\n<aside id=youtube>\n<div class=\"ui two column stackable grid container\">\n<div class=\"column\">\n    <div class=\"ui embed mdvid\" data-source=\"youtube\" data-id=\"@ARGS@\" data-placeholder=\"https://img.youtube.com/vi/@ARGS@/0.jpg\">\n    </div>\n</div></div>\n</aside>\n\n<aside id=section>\n    <!-- section @ARGS@ -->\n</aside>\n\n<aside id=hide class=box>\n    <div style='display:none'>\n        @BODY@\n    </div>\n</aside>\n\n<aside id=avatar class=box>\n    <div class='avatar @ARGS@'>\n        <div class='avatar-image'></div>\n        <div class='ui compact message'>\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<aside id=hint class=box>\n    <div class=\"ui info message\">\n        <div class=\"content\">\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<aside id=tutorialhint class=box>\n    <div class=\"ui hint message\">\n        <div class=\"content\">\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<aside id=reminder class=box>\n    <div class=\"ui warning message\">\n        <div class=\"content\">\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<aside id=alert class=box>\n    <div class=\"ui negative message\">\n        <div class=\"content\">\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<aside id=tip class=box>\n    <div class=\"ui positive message\">\n        <div class=\"content\">\n            @BODY@\n        </div>\n    </div>\n</aside>\n\n<!-- wrapped around ordinary content -->\n<aside id=main-container class=box>\n    <div class=\"ui text\">\n        @BODY@\n    </div>\n</aside>\n\n<!-- used for 'column' box - they are collected and wrapped in 'column-container' -->\n<aside id=column class=aside>\n    <div class='column'>\n        @BODY@\n    </div>\n</aside>\n<aside id=column-container class=box>\n    <div class=\"ui three column stackable grid text\">\n        @BODY@\n    </div>\n</aside>\n@breadcrumb@\n@body@";
        function renderMarkdownAsync(content, md, options) {
            if (options === void 0) { options = {}; }
            var html = pxt.docs.renderMarkdown({
                template: template,
                markdown: md,
                theme: pxt.appTarget.appTheme
            });
            var blocksAspectRatio = options.blocksAspectRatio
                || window.innerHeight < window.innerWidth ? 1.62 : 1 / 1.62;
            $(content).html(html);
            $(content).find('a').attr('target', '_blank');
            var renderOptions = pxt.runner.defaultClientRenderOptions();
            renderOptions.tutorial = !!options.tutorial;
            renderOptions.blocksAspectRatio = blocksAspectRatio || renderOptions.blocksAspectRatio;
            renderOptions.showJavaScript = runner.editorLanguageMode == LanguageMode.TypeScript;
            if (options.print) {
                renderOptions.showEdit = false;
                renderOptions.simulator = false;
            }
            return pxt.runner.renderAsync(renderOptions).then(function () {
                // patch a elements
                $(content).find('a[href^="/"]').removeAttr('target').each(function (i, a) {
                    $(a).attr('href', '#doc:' + $(a).attr('href').replace(/^\//, ''));
                });
                // enable embeds
                $(content).find('.ui.embed').embed();
            });
        }
        runner.renderMarkdownAsync = renderMarkdownAsync;
        var programCache;
        var apiCache;
        function decompileSnippetAsync(code, options) {
            // code may be undefined or empty!!!
            var packageid = options && options.packageId ? "pub:" + options.packageId :
                options && options.package ? "docs:" + options.package
                    : null;
            return loadPackageAsync(packageid, code)
                .then(function () { return getCompileOptionsAsync(pxt.appTarget.compile ? pxt.appTarget.compile.hasHex : false); })
                .then(function (opts) {
                // compile
                if (code)
                    opts.fileSystem["main.ts"] = code;
                opts.ast = true;
                if (options.jres) {
                    var tilemapTS = pxt.emitTilemapsFromJRes(JSON.parse(options.jres));
                    if (tilemapTS) {
                        opts.fileSystem[pxt.TILEMAP_JRES] = options.jres;
                        opts.fileSystem[pxt.TILEMAP_CODE] = tilemapTS;
                        opts.sourceFiles.push(pxt.TILEMAP_JRES);
                        opts.sourceFiles.push(pxt.TILEMAP_CODE);
                    }
                }
                var compileJS = undefined;
                var program;
                if (options && options.forceCompilation) {
                    compileJS = pxtc.compile(opts);
                    program = compileJS && compileJS.ast;
                }
                else {
                    program = pxtc.getTSProgram(opts, programCache);
                }
                programCache = program;
                // decompile to python
                var compilePython = undefined;
                if (pxt.appTarget.appTheme.python) {
                    compilePython = ts.pxtc.transpile.tsToPy(program, "main.ts");
                }
                // decompile to blocks
                var apis = getApiInfo(program, opts);
                return ts.pxtc.localizeApisAsync(apis, runner.mainPkg)
                    .then(function () {
                    var blocksInfo = pxtc.getBlocksInfo(apis);
                    pxt.blocks.initializeAndInject(blocksInfo);
                    var bresp = pxtc.decompiler.decompileToBlocks(blocksInfo, program.getSourceFile("main.ts"), {
                        snippetMode: options && options.snippetMode,
                        generateSourceMap: options && options.generateSourceMap
                    });
                    if (bresp.diagnostics && bresp.diagnostics.length > 0)
                        bresp.diagnostics.forEach(function (diag) { return console.error(diag.messageText); });
                    if (!bresp.success)
                        return {
                            package: runner.mainPkg,
                            compileProgram: program,
                            compileJS: compileJS,
                            compileBlocks: bresp,
                            apiInfo: apis
                        };
                    pxt.debug(bresp.outfiles["main.blocks"]);
                    if (options.jres) {
                        tilemapProject = new pxt.TilemapProject();
                        tilemapProject.loadPackage(runner.mainPkg);
                        tilemapProject.loadJres(JSON.parse(options.jres), true);
                    }
                    var blocksSvg = pxt.blocks.render(bresp.outfiles["main.blocks"], options);
                    if (options.jres) {
                        tilemapProject = null;
                    }
                    return {
                        package: runner.mainPkg,
                        compileProgram: program,
                        compileJS: compileJS,
                        compileBlocks: bresp,
                        compilePython: compilePython,
                        apiInfo: apis,
                        blocksSvg: blocksSvg
                    };
                });
            });
        }
        runner.decompileSnippetAsync = decompileSnippetAsync;
        function getApiInfo(program, opts) {
            if (!apiCache)
                apiCache = {};
            var key = Object.keys(opts.fileSystem).sort().join(";");
            if (!apiCache[key])
                apiCache[key] = pxtc.getApiInfo(program, opts.jres);
            return apiCache[key];
        }
        function compileBlocksAsync(code, options) {
            var packageid = options && options.packageId ? "pub:" + options.packageId :
                options && options.package ? "docs:" + options.package
                    : null;
            return loadPackageAsync(packageid, "")
                .then(function () { return getCompileOptionsAsync(pxt.appTarget.compile ? pxt.appTarget.compile.hasHex : false); })
                .then(function (opts) {
                opts.ast = true;
                if (options.jres) {
                    var tilemapTS = pxt.emitTilemapsFromJRes(JSON.parse(options.jres));
                    if (tilemapTS) {
                        opts.fileSystem[pxt.TILEMAP_JRES] = options.jres;
                        opts.fileSystem[pxt.TILEMAP_CODE] = tilemapTS;
                        opts.sourceFiles.push(pxt.TILEMAP_JRES);
                        opts.sourceFiles.push(pxt.TILEMAP_CODE);
                    }
                }
                var resp = pxtc.compile(opts);
                var apis = getApiInfo(resp.ast, opts);
                return ts.pxtc.localizeApisAsync(apis, runner.mainPkg)
                    .then(function () {
                    var blocksInfo = pxtc.getBlocksInfo(apis);
                    pxt.blocks.initializeAndInject(blocksInfo);
                    if (options.jres) {
                        tilemapProject = new pxt.TilemapProject();
                        tilemapProject.loadPackage(runner.mainPkg);
                        tilemapProject.loadJres(JSON.parse(options.jres), true);
                    }
                    var blockSvg = pxt.blocks.render(code, options);
                    if (options.jres) {
                        tilemapProject = null;
                    }
                    return {
                        package: runner.mainPkg,
                        blocksSvg: blockSvg,
                        apiInfo: apis
                    };
                });
            });
        }
        runner.compileBlocksAsync = compileBlocksAsync;
        var pendingLocalToken = [];
        function waitForLocalTokenAsync() {
            if (pxt.Cloud.localToken) {
                return Promise.resolve();
            }
            return new Promise(function (resolve, reject) {
                pendingLocalToken.push(resolve);
            });
        }
        runner.initCallbacks = [];
        function init() {
            initInnerAsync()
                .done(function () {
                for (var i = 0; i < runner.initCallbacks.length; ++i) {
                    runner.initCallbacks[i]();
                }
            });
        }
        runner.init = init;
        function windowLoad() {
            var f = window.ksRunnerWhenLoaded;
            if (f)
                f();
        }
        windowLoad();
    })(runner = pxt.runner || (pxt.runner = {}));
})(pxt || (pxt = {}));
