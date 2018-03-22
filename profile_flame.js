(function() {
    'use strict';

    function profileFlame () {
        // configuable variables
        var
            // size of whole svg
            size = [1024, 768],
            // click handlers on entries
            clickHandlers = [],
            // compare mode swicher,
            // an array of two data dict must be passed when in compare mode
            compare = false,
            // reverse two data dict while comparing
            compareReverse = false,
            // four thresholds to seperate each entry of compare data
            // into five categories, such as worst, worse, normal, better, best
            thresholds = [ -0.5, -0.1, 0.1, 0.5 ],
            // entries with val / total < cutoff will not be displayed.
            cutoff = 0.0005,
            // use internal or cumulative to compare
            compareMethod = 'cumulative',
            // only compare entry with percent larger than this arg
            // is dyed to red or blue
            compareValidThreshold = 0,
            // specified entries to show their chains as a flame
            specifiedEntries = [],
            // max stack depth to be applied when parsing data.
            maxDepth = 30,
            // focus event will highlight whole chain when triggered.
            focusChain = false;

        // internal variables
        var
            // height of rect of each entry
            levelHeight = 18,
            // auto increment field to sign each flame
            flameIndex = 0,
            // default color theme
            theme = 'hot',
            // global selection for containers
            selection = null,
            //height of header and bottom
            headerHeight = 0,
            footerHeight = 40,
            tooltipMargin = 3,
            tooltipLineHeight = 18,
            minWidth = 1024,
            // flame insts
            insts = {},
            // partition object
            partition = d3.partition(),
            // scale arg
            svgScaleK = 1,
            // current and former value of x when draging
            svgDragX = {x: 0, ex: 0},
            // hide text when it scales too big
            svgScaleTextThreshold = 2,
            // final flame height accroding to max stack height
            flameHeight = null;

        // theme color generators
        var colorBase = {
            hot: {
                r: function (v){ return 205 + parseInt(50 * v) },
                g: function (v){ return parseInt(230 * v) },
                b: function (v){ return parseInt(55 * v) }
            },
            cold: {
                r: function (v){ return parseInt(55 * v) },
                g: function (v){ return parseInt(230 * v) },
                b: function (v){ return 205 + parseInt(50 * v) }
            }
        };

        // colors for comparing
        var compareColors = {
            blank: '#DDD',
            darkred: '#B70707',
            red: '#ed5565',
            green: '#1ab394',
            lightblue: 'rgb(31, 179, 243)',
            blue: '#1c84c6'
        }

////// BUSINESS FUNCTIONS
        // put container svg and toolbar
        function placeContainer (current, inst) {
            d3.select(current).select('svg.profile-flame').remove();
            d3.select(current).select('div.profile-flame-toolbar').remove();

            var index = inst.index;
            var svg = d3.select(current)
                .append("svg:svg")
                .attr('class', 'profile-flame')
                .attr("width", size[0])
                .attr("height", size[1])
                .attr("class", "profile-flame")
                .attr('id', index);
            var mainG = svg
                .append("g")
                .attr('class', 'main-g');
            svg.mainG = mainG;
            var svgRect = svg.node().getBoundingClientRect();
            inst.svgRect = svgRect;

            setScale(svg);
            setGlobalEvent(svg);
            inst.svg = svg;
            return inst;
        }

        // set global event handler
        function setGlobalEvent(svg) {
            // the g elem can get events only if it was focused.
            var globalKeyupCallback = function(e) {
                var e = d3.event;
                if (!e) { return; }
                var alt = e.altKey;
                switch(e.code) {
                    // flame focus history actions
                    case 'ArrowLeft':
                        alt && flame.backward();
                        break;
                    case 'ArrowRight':
                        alt && flame.forward();
                        break;
                    default:
                        break;
                }
            }
            var body = d3.select('body');
            // register only one keydown cb, may be overwritted by other code.
            body.on('keyup', globalKeyupCallback);
        }

        // set scale and drag event handler
        function setScale(svg) {
            var mainG = svg.mainG;
            mainG.call(
                d3.zoom()
                    // zoom times limited.
                    .scaleExtent([1, 64])
                    .filter(function(){
                        // only zoom and drag when alt key pressed
                        return d3.event.altKey
                    })
                    .on("start", function(){
                        svgDragX.x = d3.event.transform.x;
                        svgDragX.ex = d3.event.sourceEvent.x;
                    })
                    .on("zoom", function() {
                        var et = d3.event.sourceEvent.type;
                        var t = d3.event.transform;
                        // reset scale and position when scale to 1
                        if (t.k <= 1) {
                            t.k = 1;
                            t.x = t.y = 0;
                        }

                        var x = t.x;
                        svgScaleK = t.k;

                        // do not use event transform, it cannot fit scaled x
                        if (et == "mousemove") {
                            t.x = x = svgDragX.x - (svgDragX.ex - d3.event.sourceEvent.x)
                        }

                        // scale main g
                        mainG.attr("transform",
                            "translate({X}, 0) scale({K}, 1)"
                                .replace("{X}", x)
                                .replace("{K}", svgScaleK)
                        );
                        if (et == "wheel") {
                            // hide text when scale too big
                            // auto drawing on the fly is tested
                            // and showed a pool performce on big flame.
                            if (t.k > svgScaleTextThreshold) {
                                mainG.selectAll("text.gtext")
                                    .attr("class", function(d, i, e) {
                                        if (!e[0]) { return ""; }
                                        e[0].classList.add("hide");
                                        return e[0].classList.value;
                                    });
                            }
                            else {
                                mainG.selectAll("text.gtext")
                                    .attr("class", function(d, i, e) {
                                        if (!e[0]) { return ""; }
                                        e[0].classList.remove("hide");
                                        return e[0].classList.value;
                                    });
                            }
                        }
                    })
            );
        }

        // draw no data tip
        function drawNoData(inst){
            inst.svg.append("text")
                .attr('x', size[0] / 2)
                .attr('y', 50)
                .attr('dy', '.35em')
                .style('font-size', '18px')
                .text('No Data.');
        }

        // draw flame
        function draw() {
            var width = size[0],
                height = size[1];
            selection.each(function(data){
                var inst = insts[data._index];
                if (inst.noData) {
                    drawNoData(inst);
                    return;
                }
                var tree = inst.tree.sum(_sum).sort(_sort);
                // var tree = inst.tree.sort(_sort);
                var cutoffDepth = 0;
                var nodes = partition(tree).descendants().filter(function(n){
                    // cutoff small entries and hide entries
                    var cut = n.x1 - n.x0 < cutoff;
                    if (!cut) {
                        cutoffDepth = Math.max(cutoffDepth, n.depth);
                    }
                    return !cut;
                });

                var totalWidth = width / (tree.x1 - tree.x0);
                var height = Math.min(
                    tree.data.realDepth,
                    maxDepth,
                    cutoffDepth || 99999
                ) + 1;
                // if flameHeight exists, use former value
                // to keep height when switch focus
                flameHeight = flameHeight || levelHeight * height;

                var height = flameHeight + headerHeight + footerHeight
                            || height;
                size[1] = height;
                inst.svg.attr('height', height);

                var X = d3.scaleLinear().range([0, width]),
                    Y = d3.scaleLinear().range([0, levelHeight]);

                var cbTranslate = function(n) {
                    var x = X(n.x0),
                        y = flameHeight - Y(n.depth)
                            + headerHeight - levelHeight;
                    return "translate({X}, {Y})"
                        .replace('{X}', x)
                        .replace('{Y}', y);
                }

                var cbDisplay = function(n) {
                    return (( n.x1 - n.x0 ) * totalWidth < 30) || n.data.gap
                        ? 'none': 'block';
                }

                var cbWidth = function(n) { return (n.x1 - n.x0) * totalWidth;}
                var cbText = function(n) {
                    if (n.data.gap) {
                        return;
                    }
                    var entry = n.data.entry;
                    n.data.entryInfo = formatComplexEntry(entry);
                    entry = n.data.entryInfo.shortEntry;
                    var fontWidth = 7,
                        padding = 3;
                    n.data._showHighlightFunction = false;
                    var width = (n.x1 - n.x0) * totalWidth;
                    if (width < 30) {
                        return;
                    }
                    else {
                        var maxLength = (width - padding) / fontWidth;
                        if (maxLength <= 4) {
                            return;
                        }
                        if (entry.length > maxLength) {
                            return entry.substr(0, maxLength - 3) + '...';
                        }
                    }
                    if (n.data.entryInfo) {
                        n.data._showHighlightFunction = true;
                        return n.data.entryInfo.entryPrefix;
                    }
                    else {
                        return entry;
                    }
                }
                var cbFuncText = function(n) {
                    if (n.data.entryInfo && n.data._showHighlightFunction) {
                        return n.data.entryInfo.function;
                    }
                    return
                }
                var cbHeight = function(n) { return levelHeight; }
                var cbFill = function(n) { return n.data.color; }
                var cbVisible = function(n) {
                    return n.data.gap || n.data.x1 - n.data.x0 == 0
                        ? 'hidden' : 'visible';
                }
                var cbClass = function(n) {
                    var class_ = 'node';
                    if (n.data.virtual) {
                        class_ += ' virtual';
                    }
                    if (specifiedEntries
                        && specifiedEntries.indexOf(n.data.entry) !== -1) {
                        class_ += ' specified';
                    }
                    return class_;
                }

                var cbTextClass = function() {
                    var c = "gtext";
                    if (svgScaleK > svgScaleTextThreshold) {
                        c += " hide";
                    }
                    return c;
                }

                var cbId = function(n) { return n.data.id; }

                inst.svg.mainG.selectAll('g.node').remove();

                var g = inst.svg.mainG.selectAll('g.node').data(nodes);

                var node = g.enter().append('g')
                    .attr('id', cbId)
                    .attr('class', cbClass)
                    .attr('visibility', cbVisible)
                    .attr("transform", cbTranslate)
                    .attr("width", cbWidth);

                node.append("rect")
                    .attr("height", cbHeight)
                    .attr("fill", cbFill)
                    .attr("class", "grect")
                    .attr("width", cbWidth)
                    .attr('rx', 1.5)
                    .attr('ry', 1.5);

                var text = node.append("text")
                    .attr('x', 5)
                    .attr('y', levelHeight / 2)
                    .attr("class", cbTextClass)
                    .attr('dy', '.35em')
                    .style("display", cbDisplay)
                    .text(cbText);

                text.append("tspan")
                    .attr("class", function(n) {
                        return cbTextClass(n) + " highlightFunction";
                    })
                    .text(cbFuncText);

                // node.on event cannot ensure n as a argument.
                // like mouseout
                // so pass exact n to cb in closures.
                node.each(function(n) {
                    d3.select(this)
                        .on('click', function() { nodeClick(n); })
                        .on('mouseover', function() { focus(n); })
                        .on('mouseout', function() { unfocus(n); })
                        .on('contextmenu', function() {
                            pin(n);
                            if (d3.event){
                                d3.event.preventDefault();
                                if (d3.event.sourceEvent){
                                    d3.event.sourceEvent.stopPropagation();
                                }
                            }
                        })
                });
                g.exit().remove();
                hideTooltip(inst);
            });
        }

        function _parse(node, rawNode, depth){
            if (depth == 0) {
                return;
            }
            for (var entry in rawNode) {
                var rawSubNodes = rawNode[entry][0];
                var value = rawNode[entry][1];
                var subNode = node.addChild(Node(entry, value));
                _parse(subNode, rawSubNodes, depth-1);
            }
        }

        // parse raw profile to a tree
        function parse(flame, index){
            if (!flame) { return; }
            var tree = Node();
            _parse(tree, flame.tree, maxDepth);
            tree.realDepth = flame.height;
            return tree.init(index);
        }

        // parse two raw profile to a tree by compare them
        function parseCompare(flame, flameToCompare, index) {
            if (compareReverse) {
                var tmp = flame;
                flame = flameToCompare;
                flameToCompare = tmp;
            }
            var tree = parse(flame, index);
            var treeToCompare = parse(flameToCompare, index);
            var compareTree = function(n, _n) {
                n.compareValue = _n.value;
                n.comparePercent = _n.percent;
                n.internalCompareValue = _n.internalValue;
                n.internalComparePercent = _n.internalPercent;
                Object.keys(n.index).forEach(function(entry){
                    var c = n.index[entry];
                    var _nc = _n.index[entry];
                    if (c && _nc) {
                        compareTree(c, _nc);
                    }
                });
            }
            compareTree(tree, treeToCompare);
            return tree.redyeAll();
        }

        function cleanup(keeps) {
            keeps = keeps || [];
            for (var i in insts) {
                if (keeps.indexOf(i) != -1){
                    continue;
                }
                delete insts[i];
            }
        }

        // build flame
        function flame(s) {
            if (!s) {
                return flame;
            }
            selection = s;
            var indexes = [];
            selection.each( function(data) {
                var index = 'flame' + flameIndex;
                data['_index'] = index;
                flameIndex += 1;
                indexes.push(index);
                var inst = insts[index] = {
                    id: index,
                    zoomHistory: gnrZoomHistory(),
                    tree: null,
                    title: null,
                    noData: false,
                };
                if (compare && (!data[1].flame || !data[1].flame.tree)){
                    compare = false;
                }
                if (!compare && data.flame === undefined) {
                    // is array, set data to array[0]
                    data = data[0];
                }
                if ( compare ){
                    if ( !data[0] || !data[1] ){
                        var err = 'Compare mod needs an array contains two profiles';
                        throw err;
                        return;
                    }
                    inst.title = 'Compare of '
                        + data[0].title + ' and '
                        + data[1].title;
                    inst.tree = parseCompare(
                        data[0].flame, data[1].flame, index
                    );
                    if (!data[0].flame || !data[0].flame.num){
                        inst.noData = true;
                    }
                    inst.compareFlame = [data[0].flame, data[1].flame];
                }
                else{
                    inst.title = data.title;
                    inst.tree = parse(data.flame, index);
                    if (!data.flame || !data.flame.num){
                        inst.noData = true;
                    }
                }
                placeContainer(this, inst);
                inst.tree = d3.hierarchy(inst.tree);
                filterSpecifiedEntries(inst.tree);

                inst.zoomHistory.reset(inst.tree);
                return inst;
            });
            cleanup(indexes);

            // reset flame height to fit new data
            flameHeight = null;
            draw();
            return flame;
        }

        flame.width = function(w) {
            if (arguments.length) {
                if (w > minWidth) {
                    size[0] = w - 10;
                }
                return flame;
            }
            else {
                return size[0];
            }
        }

        flame.height = function(h) {
            if (arguments.length) {
                size[1] = h;
                return flame;
            }
            else {
                return size[1];
            }
        }

        flame.cutoff = function(d) {
            if (arguments.length) {
                cutoff = d;
                return flame;
            }
            else {
                return cutoff;
            }
        }

        flame.maxDepth= function(d) {
            if (arguments.length) {
                maxDepth = d;
                return flame;
            }
            else {
                return maxDepth;
            }
        }

        flame.compare = function(t) {
            if (arguments.length) {
                compare = t;
                return flame;
            }
            else {
                return compare;
            }
        }

        flame.clickHandler = function(cb) {
            if (arguments.length){
                clickHandlers.push(cb);
                return flame;
            }
            else{
                return clickHandlers;
            }
        }

        flame.specifiedEntries = function(t) {
            if (arguments.length){
                specifiedEntries = t
                return flame;
            }
            else{
                return specifiedEntries;
            }
        }

        flame.search = function(kw) {
            return search(getLastInst(), kw);
        }

        flame.reset = function() {
            hardReset(getLastInst());
        }

        flame.reverseCompare = function() {
            reverseCompare(getLastInst());
        }

        flame.compareMethod = function(cb) {
            if (arguments.length){
                compareMethod = cb
                return flame;
            }
            else{
                return compareMethod;
            }
        }

        flame.backward = function() {
            var n = getLastInst().zoomHistory.backward();
            if (n) {
                zoom(n, true);
            }
        }

        flame.forward = function() {
            var n = getLastInst().zoomHistory.forward();
            if (n) {
                zoom(n, true);
            }
        }

        flame.historyPossible = function() {
            var zoomHistory = getLastInst().zoomHistory;
            return {
                backward: zoomHistory.canBackward(),
                forward: zoomHistory.canForward(),
            }
        }

        function getLastInst() {
            if (!insts) { return;}
            var index = 'flame' + (flameIndex - 1);
            return insts[index];
        }

        function stripEntry(entry){
            return entry.replace(/ /g, '-')
                .replace(/</g, '')
                .replace(/>/g, '')
                .replace(/:/g, '-')
                .replace(/./g, '-')
        }

        // simple data node class
        function Node(entry, value, percent, compareValue){
            entry = entry || 'root';
            return {
                entry: entry,
                // value to draw
                value: value,
                // compare value for comparing
                compareValue: compareValue,
                // a raw copy of value
                // to keep raw value when value changed while drawing
                raw: null,
                percent: percent,
                depth: 0,
                children: [],
                // index of nodes when parsing
                index: {},
                // sum( children.value )
                childrenSum: 0,
                addChild: function(n){
                    if (this.index[n.entry]){
                        var currentN = this.index[n.entry];
                        currentN.value += n.value;
                    }
                    else{
                        this.index[n.entry] = n;
                    }
                    // childrenSum contains no gap!!!
                    this.childrenSum += n.value;
                    return this.index[n.entry];
                },
                init: function(index, root, parent) {
                    // init root node's value and percent
                    if (this.entry === 'root') {
                        this.value = this.childrenSum;
                        root = this;
                        parent = this;
                        this.depth = 0;
                        this.percent = 1;
                    }
                    else{
                        var total = root.value;
                        this.depth = parent.depth + 1;
                        this.percent = this.value / total;
                    }
                    this.internalValue = 0;
                    this.internalPercent = 0;
                    // gap node has no children and no need to dye.
                    if (! this.gap) {
                        this.shift();
                        this.dye();
                        for(var i=0; i<this.children.length; i++){
                            this.children[i].init(index, root, this);
                        }
                        // only non gap entry has internal
                        this.internalValue = this.value - this.childrenSum;
                        this.internalPercent = total ?
                            this.internalValue / total : 0;
                    }
                    this.instIndex = index;
                    this.id = getRandomString() + '-' + stripEntry(this.entry);
                    this.raw = this.value;
                    return this;
                },
                shift: function() {
                    // push children into children array and count percent
                    for (var entry in this.index){
                        var child = this.index[entry];
                        this.children.push(child);
                        child.relativePercent = child.value / this.value;
                    }
                    // fill gap only when children exist
                    if (this.children.length && this.childrenSum < this.value){
                        var gapValue = this.value - this.childrenSum;
                        this.children.push(Node(
                            'gap',
                            gapValue,
                            gapValue / this.value
                        ).setGap());
                    }
                    return this;
                },
                setGap: function() {
                    this.gap = true;
                    return this;
                },
                redyeAll: function() {
                    this.dye(true);
                    if (! this.gap) {
                        for(var i=0; i<this.children.length; i++){
                            this.children[i].redyeAll();
                        }
                    }
                    return this;
                },
                countCompare: function(){
                    var percent = this.internalPercent;
                    var comparePercent = this.internalComparePercent;
                    this.internalCompareDiff =
                        (percent - comparePercent) / comparePercent;
                    this.internalCompareValid =
                        percent >= compareValidThreshold
                        && comparePercent >= compareValidThreshold;

                    var percent = this.percent;
                    var comparePercent = this.comparePercent;
                    this.compareDiff =
                        (percent - comparePercent) / comparePercent;
                    this.compareValid =
                        percent >= compareValidThreshold
                        && comparePercent >= compareValidThreshold;
                },
                dye: function(redo) {
                    if (this.color && !redo){
                        return this;
                    }
                    if (compare) {
                        this.countCompare();

                        if (compareMethod == 'internal') {
                            var compareDiff = this.internalCompareDiff;
                            var compareValid = this.internalCompareValid;
                            var comparePercent = this.internalComparePercent;
                        }
                        else{
                            var compareDiff = this.compareDiff;
                            var compareValid = this.compareValid;
                            var comparePercent = this.comparePercent;
                        }
                        if (comparePercent === null
                            || comparePercent === undefined
                        ) {
                            compareDiff = null;
                        }
                        else if(!compareValid) {
                            compareDiff = 0;
                        }
                        this.color = compareToColor(compareDiff);
                    }
                    else {
                        var theme = 'hot';
                        if (isVmStack(this.entry)){
                            theme = 'cold';
                        }
                        this.color = generateColor(
                            hashEntry(this.entry), theme
                        );
                    }
                    return this;
                },
                trim: function() {
                    delete this.childrenSum;
                    delete this.index;
                    delete this.setGap;
                    delete this.addChild;
                    delete this.init;
                    delete this.shift;
                    delete this.dye;
                    delete this.trim;
                }
            }
        }

        function isVmStack(entry) {
            if (entry.toLowerCase().indexOf('.py') != -1){
                return true;
            }
            if (entry.indexOf('.c->') != -1){
                return true;
            }
            if (entry.indexOf('.lua') != -1){
                return true;
            }
            return false;
        }


////// ACTION FUNCTIONS

        // reverse two profiles for comparing
        function reverseCompare(inst) {
            if (!compare) {
                return;
            }
            compareReverse = !compareReverse;
            inst.svg.remove();

            flame(selection);
            // cannot replay while after drawing,
            // svg cannot refreshed immediately
            //inst.searchInput.node().value = inst.searchKw;
            //search(inst);
        }

        // search entries by kw from searchInput
        function search(inst, kw) {
            if (kw === undefined || kw === null) {
                var searchInputNode = inst.searchInput.node();
                var kw = inst.searchKw = searchInputNode.value.toLowerCase();
            }
            var count = 0;
            var match = 0;
            var internalMatch = 0;
            travel(inst.tree, function(n){
                if (searchMatch(n.data.entry, kw)){
                    n.data.onSearch = true;
                    addClass(
                        inst.svg.select("#" + n.data.id),
                        'on-search'
                    );
                    count += 1;
                    internalMatch += n.data.internalPercent;
                    return true;
                }
                else if (n.data.onSearch) {
                    n.data.onSearch = false;
                    removeClass(
                        inst.svg.select("#" + n.data.id),
                        'on-search'
                    );
                }
                return false;
            }, function(n){
                match += n.data.percent;
                return false;
            });
            return {
                count: count,
                match: match,
                internalMatch: internalMatch
            };
        }

        function searchMatch(entry, kw){
            if (entry == 'gap') {
                return false;
            }
            if (kw) {
                if (entry.toLowerCase().indexOf(kw) != -1) {
                    return true;
                }
                var r = new RegExp(kw, "gi");
                if (r.test(entry)) {
                    return true;
                }
            }
            return false;
        }

        // clean search flag and highlight
        function cleanSearch(inst) {
            inst.svg.searchInputNode.value = '';
            travel(inst.tree, function(n){
                if (n.data.onSearch) {
                    n.data.onSearch = false;
                    removeClass(
                        inst.svg.select("#" + n.data.id),
                        'on-search'
                    );
                }
            });
        }

        // replay search highlight on entries with search flag
        function replaySearch(inst) {
            travel(inst.tree, function(n){
                if (n.data.onSearch) {
                    addClass(
                        inst.svg.select("#" + n.data.id),
                        'on-search'
                    );
                }
            });
        }

        // reset search and zoom
        function reset(index) {
            var inst = insts[index];
            cleanSearch(inst);
            zoom(inst.tree);
        }

        // reset all contains reverse, rebuild svg
        function hardReset(inst){
            svgScaleK = 1;
            compareReverse = false;
            inst.svg.remove();

            flame(selection);
        }

        // make focus event static.
        function pin(n) {
            var inst = getInst(n);
            inst.pin = !inst.pin;
        }

        function nodeClick(n) {
            var e = d3.event;
            if (e.altKey) {
                specifyEntry(n);
            }
            else {
                zoom(n);
            }
        }

        function specifyEntry(n) {
            var entry = n.data.entry;
            var inst = getInst(n)
            specifiedEntries = [entry];
            filterSpecifiedEntries(inst.tree);
            draw();
        }

        // zoom to expand a entry
        function zoom(n, history) {
            var inst = getInst(n)
            inst.pin = false;
            hideBrothers(n);
            virtualParents(n);
            show(n);
            draw();
            replaySearch(inst);
            if (!history) {
                inst.zoomHistory.set(n);
            }
        }

        // make parent virtual while expand a entry
        function virtualParents(n) {
            n = n.parent;
            while (n && n.data) {
                n.data.virtual = true;
                n = n.parent;
            }
        }

        // hide entries besides specifiedEntries
        function filterSpecifiedEntries(root) {
            if (! specifiedEntries || ! specifiedEntries.length) { return; }
            function _findSpecifiedEntries(n) {
                if (specifiedEntries.indexOf(n.data.entry) !== -1) {
                    n.data.specified = true;
                    return true;
                }
                if (n.children) {
                    var found = false;
                    for (var i=0; i<n.children.length; i++) {
                        if (_findSpecifiedEntries(n.children[i])){
                            found = true;
                        }
                        else {
                            n.children[i].data.value = 0;
                            n.children[i].data.notSpecified = true;
                        }
                    }
                    return found;
                }
                else{
                    return false;
                }
            }
            _findSpecifiedEntries(root);
        }

        // hide brothers recursively
        function hideBrothers(n) {
            var parent = n.parent;
            if (!parent) {
                return;
            }
            if (parent.children) {
                parent.children.forEach(function(child) {
                    if (! equal(n, child)) {
                        hide(child);
                    }
                });
            }
            if (parent.parent){
                hideBrothers(parent);
            }
        }

        // set entry value to 0 to prevent it from display
        // recursively
        function hide(node) {
            // d3's sum get value from node.data
            node.data.value = 0;
            node.children && node.children.forEach(hide);
        }

        // reset entry value show it.
        // recursively
        function show(node) {
            if (node.data.value == 0 && node.data.notSpecified) {
                return;
            }
            node.data.value = node.data.raw;
            node.data.virtual = false;
            node.children && node.children.forEach(show);
        }

        // highlight entry and its ancestors when mouse on
        function focus(n) {
            var inst = getInst(n);
            if (inst.pin) { return; }
            if (focusChain) {
                var chain = getChain(n);
                chainElementApply(chain, function(e){
                    if (! hasClass(e, 'virtual')) {
                        addClass(e, 'focus');
                        e.style('opacity', 1);
                    }
                });
            }
            else {
                var e = inst.svg.select("#" + n.data.id);
                if (! hasClass(e, 'virtual')) {
                    addClass(e, 'focus');
                    e.style('opacity', 1);
                }
            }
            showTooltip(inst, n);
        }

        // unhighlight
        function unfocus(n) {
            var inst = getInst(n);
            if (inst.pin) { return; }
            if (focusChain) {
                var chain = getChain(n);
                chainElementApply(chain, function(ele){
                    removeClass(ele, 'focus');
                });
            }
            else {
                var e = inst.svg.select("#" + n.data.id);
                removeClass(e, 'focus');
            }
            hideTooltip(inst);
        }

        function formatTooltip(n) {
            var dataDesc = parseDataDesc(n);
            var info = n.data.entryInfo || {};
            var contentArray = [
                "Entry          : " + (info.shortEntry || info.entry || n.entry),
                dataDesc.internalContent,
                dataDesc.cumulativeContent,
            ]
            if (info.entry != info.function) {
                contentArray.push("Function     : " + info.function);
            }
            if (info.entry != info.shortEntry) {
                contentArray.push("FullEntry     : " + info.entry);
            }
            if (info.module) {
                contentArray.push("Module       : " + info.module);
            }
            if (info.filepath) {
                contentArray.push("SourceFile  : " + info.filepath);
            }
            if (info.lineNumber) {
                contentArray.push("SourceLine : " + info.lineNumber);
            }
            return contentArray;
        }

        function fitTooltipWidth(contents, charCntInLine=80) {
            var contentArray = [];
            for (var j=0; j<contents.length; j++) {
                var content = contents[j];
                var n = parseInt( content.length / charCntInLine ) + 1;
                var i = 0;
                while (content) {
                    // reserved 2 blank for tab
                    var len = i==0 ? charCntInLine : (charCntInLine - 2);
                    var line = content.substr(0, charCntInLine);
                    if (line.trim()) {
                        if (i > 0) {
                            line = "  " + line;
                        }
                        contentArray.push(line.replace(/ /g, "\u00A0"));
                    }
                    content = content.substr(charCntInLine);
                    i += 1;
                }
            }
            return contentArray;
        }

        function countMaxTextWidth(inst, contentArray) {
            var textWidth = 0;
            var tmpG = inst.svg.append("g");

            for (var i=0; i<contentArray.length; i++) {
                var tmpText = tmpG.append('text').text(contentArray[i]);
                var textWidth = Math.max(
                    tmpText.node().getComputedTextLength(),
                    textWidth
                );
                tmpText.remove();
            }
            tmpG.remove();
            return textWidth;
        }

        function countTooltipBox(inst, e, n, textWidth, lines) {
            // use event.x, while event.y can be not correct when srcolled
            var offset = 4;
            var x = e.x + offset;
            x -= inst.svgRect.left;
            if (x < 0) { x = 0; }

            var nodeElement = inst.svg.select("#" + n.data.id);
            var et = nodeElement.attr('transform')
                .replace('translate(', '').replace(')', '').split(', ');
            var y = parseInt(et[1]) + levelHeight + offset;

            if (x == undefined || y == undefined) { return; }

            // count remain xrange after draw tip
            // if xrange < 0, means tip overflowed, count new x to fit
            var xrange = size[0] - (x + textWidth);
            if (xrange < 0){
                x = Math.max(
                    //size[0] - textWidth - offset - (size[0] - x) - 10,
                    x - textWidth - offset - 10,
                    0
                );
            }
            var height = tooltipMargin * 2 +
                tooltipLineHeight * lines;
            // as well as xrange
            var yrange = size[1] - (y + height);
            if (yrange < 0) {
                y = Math.max(
                    //size[1] - height - offset - (size[1] - y) - levelHeight,
                    y - height - offset - levelHeight,
                    0
                );
            }
            return {
                x: x,
                y: y,
                height: height
            }
        }

        // draw a tooltip to describe entry
        function showTooltip(inst, n) {
            var contentArray = fitTooltipWidth( formatTooltip(n) );
            if (!contentArray || contentArray.length == 0) { return; }

            var textWidth = countMaxTextWidth(inst, contentArray);
            var box = countTooltipBox(inst, d3.event, n, textWidth, contentArray.length);
            if (!box) { return; }

            var tip = inst.svg.append("g")
                .attr("class", "profile-flame-tooltip")

            tip.append('rect')
                .attr('width', textWidth + 8)
                .attr('height', box.height)
                .attr('x', box.x)
                .attr('y', box.y + 2)
                .attr('rx', 5)
                .attr('ry', 5)
                .attr('fill', '#333333')
                .attr('opacity', '.85');

            for (var i=0; i<contentArray.length; i++) {
                var content = contentArray[i];
                var yi = box.y +  i * tooltipLineHeight;
                tip.append('text')
                    .attr('x', box.x)
                    .attr('y', yi)
                    .attr('dx', '0.35em')
                    .attr('dy', '1.5em')
                    .attr('fill', '#FFFFFF')
                    .text(content);
            }
        }

        function hideTooltip(inst) {
            inst.svg.selectAll("g.profile-flame-tooltip").remove();
        }


////// CALLBACK FUNCTIONS
        //
        // sort callback, sort entry by is calls asc, gap is always behind.
        function _sort(a, b) {
            if (a.data.gap) {
                return 1;
            }
            else if (b.data.gap) {
                return -1;
            }
            return d3.ascending(a.value, b.value);
        }

        // sum callback
        // return 0 when n has children
        // to use only leaf value to count sum.
        function _sum(n) {
            return !n.children || n.children.length == 0 ? n.value : 0;
        }


////// TOOL FUNCTIONS

        var pathSeps = [
            "\\",
            "/"
        ];
        var getShortDemangled = function(d) {
            // py function and lua function
            if (d.indexOf('.py') != -1 || d.indexOf('.lua') != -1){
                for(var i=0; i<pathSeps.length; i++) {
                    var xIndex = d.lastIndexOf(pathSeps[i])
                    if (xIndex != -1) {
                        d = d.substr(xIndex + 1);
                    }
                }
            }
            // c/c++ function
            else {
                if (d.indexOf('<') == -1 && d.indexOf('(') == -1) {
                    return d;
                }
                var dl = d.split('');
                var indexes = getMatchedBracketIndexs(d, '<', '>');
                for (var i=0; i<indexes.length; i++) {
                    var indexPair = indexes[i];
                    for (var j=indexPair[0]; j<=indexPair[1]; j++) {
                        dl[j] = '';
                    }
                }
                var indexes = getMatchedBracketIndexs(d, '(', ')');
                for (var i=0; i<indexes.length; i++) {
                    var indexPair = indexes[i];
                    for (var j=indexPair[0]+1; j<indexPair[1]; j++) {
                        dl[j] = '';
                    }
                }
                d = dl.join('');
                // remove () and const behind.
                d = d.split('(', 1)[0];
            }
            return d;
        };

        var formatComplexEntry = function(d) {
            var ret = {
                shortEntry: null,
                entryPrefix: null,
                function: null,
                entry: null,
                module: null,
                filepath: null,
                lineNumber: null,
            }
            if (d.indexOf('.py') != -1 || d.indexOf('.lua') != -1){
                // vm stack
                ret.entry = ret.shortEntry = getShortDemangled(d);
                var items = d.split(":")
                // last one is line number, so it shoud be path:entry:line
                ret.lineNumber = parseInt(items[items.length-1]) || null;
                // path may have ':', so join remain items
                ret.filepath = items.slice(0, ret.lineNumber ? -2 : -1).join(":");
                if (ret.lineNumber) {
                    ret.shortEntry = ret.shortEntry.replace(":" + ret.lineNumber, "");
                }
            }
            else {
                // common mtrace format
                ret.entry = d;
                ret.shortEntry = getShortDemangled(ret.entry);
            }
            var funcSep = ":"
            var index = ret.shortEntry.lastIndexOf(funcSep)
            if (index != -1) {
                ret.function = ret.shortEntry.substr(index+1);
                ret.entryPrefix = ret.shortEntry.substr(0, index+1);
            } else {
                ret.function = ret.shortEntry;
            }

            return ret;
        }

        var gnrZoomHistory = function() {
            return {
                current: null,
                forwardArray: [],
                backwardArray: [],
                size: 20,
                set: function(n) {
                    if (this.current) {
                        this.push(this.backwardArray, this.current);
                    }
                    this.current = n;
                },
                push: function(a, n) {
                    if (a[a.length-1] == n) {
                        return;
                    }
                    a.push(n);
                    while (a.length > this.size) {
                        a.shift();
                    }
                },
                forward: function() {
                    var n = this.forwardArray.pop();
                    if (n) {
                        if (this.current) {
                            this.push(this.backwardArray, this.current);
                        }
                        this.current = n;
                    }
                    return n;
                },
                backward: function() {
                    var n = this.backwardArray.pop();
                    if (n) {
                        if (this.current) {
                            this.push(this.forwardArray, this.current);
                        }
                        this.current = n;
                    }
                    return n;
                },
                canForward: function() {
                    return this.forwardArray.length != 0;
                },
                canBackward: function() {
                    return this.backwardArray.length != 0;
                },
                reset: function(r) {
                    this.backwardArray.length = 0;
                    this.forwardArray.length = 0;
                    this.current = r;
                }
            }
        };

        // node equal
        function equal(m, n) {
            return m.data.id == n.data.id;
        }

        // used to make entry id unique
        function getRandomString(len){
            len = len || 8;
            var ignore = [91, 96];
            var min = 65;
            var max = 122;
            var range = max - min;
            var string = '';
            while (string.length < len){
                var pos = parseInt(Math.random() * range) + min;
                if (ignore[0] <= pos && pos <= ignore[1]){
                    continue;
                }
                string += String.fromCharCode(pos);
            }
            return string;
        }

        // travel each node of tree and call cb
        // nestCb are only call when cb returns true
        // and travel to children when itself returns true
        function travel(tree, cb, nestCb){
            var nextNestCb = nestCb;
            if (tree) {
                if (cb(tree) && nestCb){
                    if (!nestCb(tree)){
                        nextNestCb = null;
                    }
                }
                if (tree.children) {
                    for (var i=0; i<tree.children.length; i++) {
                        travel(tree.children[i], cb, nextNestCb);
                    }
                }
            }
        }

        // get flame instance by data node
        function getInst(n) {
            return insts[n.data.instIndex];
        }

        function hasClass(e, _class) {
            return e.attr('class').split(' ').indexOf(_class) != -1
        }

        function addClass(e, _class) {
            if (!e || !e.size()){ return; }
            var currentClassList = e.attr('class').split(' ');
            if (currentClassList.indexOf(_class) == -1) {
                currentClassList.push(_class);
                e.attr('class', currentClassList.join(' '));
            }
        }

        function removeClass(e, _class) {
            if (!e || !e.size()){ return; }
            var currentClassList = e.attr('class').split(' ');
            var index = currentClassList.indexOf(_class);
            if (index != -1) {
                currentClassList.splice(index, 1);
                e.attr('class', currentClassList.join(' '));
            }
        }

        // make text shorter
        function trimText(text, max) {
            if (max && text.length > max) {
                text = text.substr(0, max - 3) + '...';
            }
            return text;
        }

        // generate color by hash val
        function generateColor(hash, subTheme) {
            subTheme = subTheme || theme;
            var base = colorBase[subTheme];
            var r = base.r(hash),
                g = base.g(hash),
                b = base.b(hash);
            //console.log(hash, r, g, b)
            return 'rgb({R}, {G}, {B})'
                .replace('{R}', r)
                .replace('{G}', g)
                .replace('{B}', b);
        }

        // generate color by comparing of two val
        function compareToColor(percent) {
            if (percent === null){
                return compareColors.blank;
            }
            var i=0;
            for(; i<thresholds.length; i++){
                if (percent <= thresholds[i]) {
                    break;
                }
            }
            switch (i) {
                case 0:
                    return compareColors.blue;
                case 1:
                    return compareColors.lightblue;
                case 2:
                    return compareColors.green;
                case 3:
                    return compareColors.red;
                case 4:
                    return compareColors.darkred;
            }
        }

        // count entry hash
        function hashEntry (entry) {
            if (! entry) {
                return 0;
            }
            // remove module names if exists.
            entry = entry.substr( entry.lastIndexOf('.') + 1 );

            var vector = 0,
                weight = 1,
                max = 1,
                mod = 10,
                hashChars = 8;

            for (var i=0; i<Math.min(entry.length, hashChars); i++) {
                var rem = entry.charCodeAt(i) % mod;
                vector += (rem / mod) * weight;
                mod += 1;
                max += 1 * weight;
                weight *= 0.7;
            }
            return Math.pow(1 - vector / max, 2);
        }

        function parseDataDesc(n) {
            if (compare && compareMethod == 'internal') {
                var value = n.data.internalValue;
                var percent = n.data.internalPercent;
            }
            else{
                var value = n.data.value;
                var percent = n.data.percent;
            }
            var internalContent = "Internal       : {V}  {P}"
                .replace('{V}', n.data.internalValue)
                .replace('{P}', formatPercent(n.data.internalPercent))
            var cumulativeContent = "Cumulative : {V}  {P}"
                .replace('{V}', n.data.value)
                .replace('{P}', formatPercent(n.data.percent))

            if (compare) {
                internalContent += ' | {V}  {P} | {D}'
                    .replace('{V}', n.data.internalCompareValue)
                    .replace('{P}',
                        formatPercent(n.data.internalComparePercent))
                    .replace('{D}', formatDiff(n.data.internalCompareDiff));
                cumulativeContent += ' | {V}  {P} | {D}'
                    .replace('{V}', n.data.compareValue)
                    .replace('{P}', formatPercent(n.data.comparePercent))
                    .replace('{D}', formatDiff(n.data.compareDiff));
            }
            return {
                internalContent: internalContent,
                cumulativeContent: cumulativeContent
            }
        }

        // parse description of entry and its data
        // shortcut the entry name if its too long
        function parseEntryDesc(n, entryMax) {
            var entry = trimText(n.data.entry, entryMax);
            var dataDesc = parseDataDesc(n);
            return "{E}||{I}||{C}"
                .replace('{E}', entry)
                .replace('{I}', dataDesc.internalContent)
                .replace('{C}', dataDesc.cumulativeContent);
        }

        function formatPercent(p) {
            return (p * 100).toFixed(2) + '%'
        }

        function formatDiff(diff) {
            if (diff === undefined
                || isNaN(diff)
                || diff === null
                || Math.abs(diff) === Infinity
            ) {
                return 'NaN';
            }
            var prefix = diff > 0 ? '+' : '';
            return prefix + (diff * 100).toFixed(2) + '%';
        }

        // get node and its ancestors to build a chain
        function getChain(n) {
            var node = n,
                nodes = [];
            while (node && node.data){
                nodes.push(node);
                node = node.parent;
            }
            return nodes;
        }

        // is data node or not
        function isNode(n) {
            return n && n.data && n.data.instIndex;
        }

        // apply a callback on all node in a chain
        function chainElementApply(chain, cb) {
            if (!chain || chain.length == 0) {
                return;
            }
            var svg = getInst(chain[0]).svg;
            for (var i=0; i<chain.length; i++) {
                var node = chain[i]
                cb( svg.select("#" + node.data.id) )
            }
        }


        return flame;
    }

    d3.profileFlame = profileFlame;


})();
