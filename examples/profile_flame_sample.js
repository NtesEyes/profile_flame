

var profileFlame = null;

function showSingleFlame(container) {
    var profileFlame = d3.profileFlame()
        .maxDepth(64);

    d3.select(container)
        .datum(exampleData1)
        .call(profileFlame);
    return profileFlame;
}

function showCompareFlame(container) {
    var profileFlame = d3.profileFlame()
        .maxDepth(64)
        .compare(true);

    d3.select(container)
        .datum([exampleData1, exampleData2])
        .call(profileFlame);
    return profileFlame;
}

function reset() {
    profileFlame.reset();
}

function doSearch() {
    var lastKw = null;
    var searchInput = document.getElementById('search-input');
    var searchResult = document.getElementById('search-result');
    setInterval(function(){
        var kw = searchInput.value;
        if (kw != lastKw) {
            lastKw = kw;
            searchResult.innerHTML = JSON.stringify(profileFlame.search(kw));
        }
    }, 500)
}

window.onload = function() {
    profileFlame = showSingleFlame('.single-flame-container');
    doSearch();
    showCompareFlame('.compare-flame-container');
}

