(function() {
    'use strict';

    function profileFlame () {
            // size of whole svg
        var size = [1024, 768],
            // click handlers when entries clicked
            clickHandlers = [],
            // compare mode or not,
            // an array of two datas must be passed when in compare mode
            compare = false,
            // reverse the two datas while compare
            compareReverse = false,
            // color theme
            theme = 'hot',
            // for thresholds to seperate each entry of compare data
            // into five categories, such as worst, worse, normal, better, best
            thresholds = [ -0.5, -0.1, 0.1, 0.5 ],
            // entries with val / total < cutoff will not be displayed.
            cutoff = 0.001,
            // switch if display the toolbar
            showToolbar = true,
            // max stack depth to be applied when parsing data.
            maxDepth = 30;

            // height of rect of each entry
        var levelHeight = 18,
            // auto increment field to sign each flame
            flameIndex = 0,
            // global selection for containers
            selection = null,
            //height of header and bottom
            headerHeight = 0,
            footerHeight = 40,
            tooltipMargin = 3,
            tooltipLineHeight = 18,
            // max count of breadcrumbs
            maxBreadcrumbs = 5,
            // flame instances indexed by flame{index}
            breadcrumbSize = [120, 30],
            minWidth = 1024,
            insts = {},
            partition = d3.partition();


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
        //
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

            var svgRect = svg.node().getBoundingClientRect();
            inst.svgRect = svgRect;

            //var title = inst.title;
            //svg.append("svg:text")
                //.attr("class", "title")
                //.attr("text-anchor", "middle")
                //.attr("y", "30")
                //.attr("x", "30")
                //.text(title);
                //
            showToolbar && putToolBar(current, inst);
            inst.svg = svg;
            return inst;
        }

        function putToolBar(current, inst) {
            var toolbar = d3.select(current).insert('div', ":first-child")
                .attr('class', 'profile-flame-toolbar')

            var searchInput = toolbar.append('input')
                .attr('placeholder', 'Search...')
                .attr('title', 'Type key words, Enter to search.')
                .on('keypress', function() {
                    var e = d3.event;
                    if (e && e.key == 'Enter') {
                        search(inst);
                        d3.event.sourceEvent && d3.event.sourceEvent.stopPropagation();
                        d3.event.preventDefault();
                    }
                });

            toolbar.append('button')
                .text('🔍')
                .attr('title', 'Click to search')
                .on('click', function() {
                    search(inst);
                    d3.event.sourceEvent.stopPropagation();
                    d3.event.preventDefault();
                })

            toolbar.append('button')
                .text('↻')
                .attr('title', 'Click to reset')
                .on('click', function() {
                    hardReset(inst);
                    d3.event.sourceEvent.stopPropagation();
                    d3.event.preventDefault();
                })

            if (compare) {
                toolbar.append('button')
                    .text('⇄')
                    .attr('title', 'Click to reverse compared profiles')
                    .on('click', function() {
                        reverseCompare(inst);
                        d3.event.sourceEvent.stopPropagation();
                        d3.event.preventDefault();
                    });
            }
            inst.searchInput = searchInput;
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
                var tree = inst.tree.sum(_sum).sort(_sort);;
                var nodes = partition(tree).descendants().filter(function(n){
                    return !n.data.cutoff;
                });

                var totalWidth = width / (tree.x1 - tree.x0);
                var height = Math.min(
                    tree.data.realDepth,
                    maxDepth,
                    tree.data.cutoffDepth || 99999
                );
                var flameHeight = levelHeight * height;

                var height = flameHeight + headerHeight + footerHeight
                            || height;
                size[1] = height;
                inst.svg.attr('height', height);
                console.log('tree', tree);


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
                    var fontWidth = 7,
                        padding = 3;
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
                            entry = entry.substr(0, maxLength - 3) + '...';
                        }
                    }
                    return entry;
                }
                var cbHeight = function(n) { return levelHeight; }
                var cbFill = function(n) { return n.data.color; }
                var cbVisible = function(n) {
                    return n.data.gap || n.data.x1 - n.data.x0 == 0
                        ? 'hidden' : 'visible';
                }
                var cbVirtual = function(n) {
                    return n.data.virtual ? 'node virtual' : 'node';
                }

                var cbId = function(n) { return n.data.id; }

                inst.svg.selectAll('g.node').remove();

                var g = inst.svg.selectAll('g.node').data(nodes);

                var node = g.enter().append('g')//.merge(g)
                    .attr('id', cbId)
                    .attr('class', cbVirtual)
                    .attr('visibility', cbVisible)
                    .attr("transform", cbTranslate)
                    .attr("width", cbWidth);

                node.append("rect")
                    .attr("height", cbHeight)
                    .attr("fill", cbFill)
                    .attr("width", cbWidth)
                    .attr('rx', 3)
                    .attr('ry', 3);

                node.append("text")
                    .attr('x', 5)
                    .attr('y', levelHeight / 2)
                    .attr('dy', '.35em')
                    .style("display", cbDisplay)
                    .text(cbText);

                // node.on event cannot ensure n as a argument.
                // like mouseout
                // so pass exact n to cb in closures.
                node.each(function(n) {
                    d3.select(this)
                        .on('click', function() { zoom(n); })
                        .on('mouseover', function() { focus(n); })
                        .on('mouseout', function() { unfocus(n); })
                        .on('contextmenu', function() {
                            pin(n);
                            d3.event.sourceEvent.stopPropagation();
                            d3.event.preventDefault();
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

        // build flame
        function flame(s) {
            if (!s) {
                return flame;
            }
            selection = s;
            selection.each( function(data) {
                var index = 'flame' + flameIndex;
                data['_index'] = index;
                flameIndex += 1;
                var inst = insts[index] = {};
                if (compare && (!data[1].flame || !data[1].flame.tree)){
                    compare = false;
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
                    if (!data[0].flame || data[0].flame.num == 0){
                        inst.noData = true;
                    }
                    inst.compareFlame = [data[0].flame, data[1].flame];
                }
                else{
                    inst.title = data.title;
                    inst.tree = parse(data.flame, index);
                    if (!data.flame || data.flame.num == 0){
                        inst.noData = true;
                    }
                }
                placeContainer(this, inst);
                inst.tree = d3.hierarchy(inst.tree);
                return inst;
            });

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

        flame.theme = function(t) {
            if (arguments.length){
                theme = t;
                return flame;
            }
            else{
                return theme;
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

        flame.search = function(kw) {
            return search(getLastInst(), kw);
        }

        flame.reset = function() {
            hardReset(getLastInst());
        }

        flame.reverseCompare = function() {
            reverseCompare(getLastInst());
        }


        flame.toolBar = function(t){
            if (arguments.length){
                showToolbar = t;
                return flame;
            }
            else{
                return showToolbar;
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
                cutoffDepth: 0,
                addChild: function(n){
                    if (this.index[n.entry]){
                        var currentN = this.index[n.entry];
                        currentN.value += n.value;
                    }
                    else{
                        this.index[n.entry] = n;
                    }
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
                    // cutoff small node
                    if (cutoff && this.percent < cutoff) {
                        this.cutoff = true;
                        if ( ! parent.cutoff) {
                            root.cutoffDepth = Math.max(
                                this.depth + 1, root.cutoffDepth);
                        }
                    }
                    // gap node has no children and no need to dye.
                    if (! this.gap) {
                        this.shift();
                        this.dye();
                        for(var i=0; i<this.children.length; i++){
                            this.children[i].init(index, root, this);
                        }
                    }
                    this.instIndex = index;
                    this.id = getRandomString() + '-' + stripEntry(this.entry);
                    this.raw = this.value;
                    //this.trim();
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
                dye: function(redo) {
                    if (this.color && !redo){
                        return this;
                    }
                    if (compare) {
                        //var value = this.value;
                        //var compareValue = this.compareValue;
                        var percent = this.percent;
                        var comparePercent = this.comparePercent;
                        this.color = compareToColor(percent, comparePercent);
                    }
                    else {
                        var theme = 'hot';
                        if (this.entry.toLowerCase().indexOf('.py') != -1){
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

////// ACTION FUNCTIONS

        // reverse two profiles for comparing
        function reverseCompare(inst) {
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
            var match = 0;
            travel(inst.tree, function(n){
                if (searchMatch(n.data.entry, kw)){
                    n.data.onSearch = true;
                    addClass(
                        inst.svg.select("#" + n.data.id),
                        'on-search'
                    );
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
            return match;
        }

        function searchMatch(entry, kw){
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
            compareReverse = false;
            inst.svg.remove();

            flame(selection);
        }

        // make focus event static.
        function pin(n) {
            var inst = getInst(n);
            inst.pin = !inst.pin;
        }

        // zoom to expand a entry
        function zoom(n) {
            var inst = getInst(n)
            inst.pin = false;
            hideBrothers(n);
            virtualParents(n);
            show(n);
            draw();
            replaySearch(inst);
        }

        // make parent virtual while expand a entry
        function virtualParents(n) {
            n = n.parent;
            while (n && n.data) {
                n.data.virtual = true;
                n = n.parent;
            }
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
            node.data.value = node.data.raw;
            node.data.virtual = false;
            node.children && node.children.forEach(show);
        }

        // make all entries apply a given opacity
        function opacityAllEntry(inst, opacity) {
            inst.svg.selectAll('g.node')
                .style('opacity', opacity);
        }

        // highlight entry and its ancestors when mouse on
        function focus(n) {
            var inst = getInst(n);
            if (inst.pin) { return; }
            //opacityAllEntry(inst, 0.5);
            var chain = getChain(n);
            chainElementApply(chain, function(e){
                if (! hasClass(e, 'virtual')) {
                    addClass(e, 'focus');
                    e.style('opacity', 1);
                }
            });
            drawBreadcrumb(inst, chain);
            showTooltip(inst, n);
        }

        // unhighlight
        function unfocus(n) {
            var inst = getInst(n);
            if (inst.pin) { return; }
            //opacityAllEntry(inst, 1);
            var chain = getChain(n);
            chainElementApply(chain, function(ele){
                removeClass(ele, 'focus');
            });
            clearBreadcrumb(inst);
            hideTooltip(inst);
        }

        function parseTooltip(n, charCntInLine=80){
            var content = parseEntryDesc(n, 0);
            var contentArray = [];
            var n = parseInt(content.length / charCntInLine) + 1;
            for (var i=0; i<n; i++) {
                contentArray.push(
                    content.substr(charCntInLine * i, charCntInLine)
                );
            }
            return contentArray;
        }

        // draw a tooltip to describe entry
        function showTooltip(inst, n) {
            var e = d3.event;
            // use event.x, while event.y can be not correct when srcolled
            var x = e.x;
            x -= inst.svgRect.left;
            if (x < 0) { x = 0; }

            var nodeElement = inst.svg.select("#" + n.data.id);
            var et = nodeElement.attr('transform')
                .replace('translate(', '').replace(')', '').split(', ');
            var y = parseInt(et[1]) + levelHeight + 2;

            if (x == undefined || y == undefined) { return; }

            var contentArray = parseTooltip(n);
            if (!contentArray || contentArray.length == 0) {
                return;
            }

            var tip = inst.svg.append("g")
                .attr("class", "profile-flame-tooltip")

            var textWidth = 0;
            for (var i=0; i<contentArray.length; i++) {
                var tmpText = tip.append('text').text(contentArray[i]);
                var textWidth = Math.max(
                    tmpText.node().getComputedTextLength(),
                    textWidth
                );
                tmpText.remove();
            }
            var range = size[0] - (x + textWidth);
            if (range < 0){
                x = size[0] - textWidth - 10;
            }
            var height = tooltipMargin * 2 +
                tooltipLineHeight * contentArray.length;
            tip.append('rect')
                .attr('width', textWidth + 8)
                .attr('height', height)
                .attr('x', x)
                .attr('y', y + 2)
                .attr('rx', 5)
                .attr('ry', 5)
                .attr('fill', '#333333')
                .attr('opacity', '.85');

            for (var i=0; i<contentArray.length; i++) {
                var content = contentArray[i];
                var yi = y +  i * tooltipLineHeight;
                tip.append('text')
                    .attr('x', x)
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

        // place a breadcrumb bar in the bottom to show chain
        function drawBreadcrumb(inst, nodes) {
            clearBreadcrumb(inst);
            if (!nodes || nodes.length == 0) {
                return;
            }
            nodes = nodes.splice(0, maxBreadcrumbs).reverse();
            var width = breadcrumbSize[0],
                height = breadcrumbSize[1],
                tail = 10,
                space = 3,
                top = size[1] - footerHeight + 3;

            var cbTranslate = function(n, i) {
                var x = i * (width + space),
                    y = top;
                return 'translate({x}, {y})'
                    .replace('{x}', x).replace('{y}', y);
            }

            var cbLabelTanslate = function(n) {
                var x = (width + space) * nodes.length + 3,
                    y = top + height / 2;
                return 'translate({x}, {y})'
                    .replace('{x}', x).replace('{y}', y);
            }
            var cbEntryText = function(n, i) {
                return trimText(n.data.entry, 16)
            }
            var cbDataText = function(n, i) {
                return parseEntryDesc(n, 32);
            }
            var cbFill = function(n) { return n.data.color; }
            var g = inst.svg.selectAll('g.legend').data(nodes);
            var node = g.enter().append('g')
                .attr('class', 'legend')
                .attr('transform', cbTranslate);

            node.append('polygon')
                .attr('points', breadcrumbPoints)
                .style('fill', cbFill);

            var text = node.append('text')
                .attr('x', (width + tail) / 2)
                .attr('y', height / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .text(cbEntryText)

            inst.svg.append('g')
                .attr('class', 'legend')
                .append('text')
                    .datum(nodes[nodes.length - 1])
                    .attr('transform', cbLabelTanslate)
                    .attr('dy', '0.35em')
                    .attr('dx', '1em')
                    .text(cbDataText)
        }

        // remove all breadcrumbs
        function clearBreadcrumb(inst) {
            inst.svg.selectAll('g.legend').remove();
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
        function compareToColor(a, b) {
            if (!b){
                return compareColors.blank;
            }
            var percent = (a - b) / b;
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

        // parse description of entry and its data
        // shortcut the entry name if its too long
        function parseEntryDesc(n, entryMax) {
            var entry = trimText(n.data.entry, entryMax);
            var content = "{E} ({V} {P})"
                .replace('{E}', entry)
                .replace('{V}', n.data.value)
                .replace('{P}', (n.data.percent * 100).toFixed(2) + '%');
            if (n.data.compareValue) {
                content += " | ({V} {P})"
                .replace('{V}', n.data.compareValue)
                .replace('{P}', (n.data.comparePercent *100).toFixed(2) + '%');
            }
            return content;
        }

        // generate breadcrumb polygon's points
        function breadcrumbPoints(d, i) {
            var width = breadcrumbSize[0],
                height = breadcrumbSize[1],
                tail = 10,
                points = [];
            points.push("0,0");
            points.push(width + ",0");
            points.push(width + tail + "," + (height / 2));
            points.push(width + "," + height);
            points.push("0," + height);
            // Leftmost breadcrumb; don't include 6th vertex.
            if (i > 0) {
                points.push(tail + "," + (height / 2));
            }
            return points.join(" ");
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
