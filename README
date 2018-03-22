# Profile Flame

A javascript lib renders profile flame graph based on d3.js.
Find more details about flame in brendangregg's [FlameGraph](https://github.com/brendangregg/FlameGraph).

## A Quick View

![FlameGraphSample](FlameGraphSample.gif)

## How To Use

A general flame:

```
var profileFlame = d3.profileFlame();

d3.select(container)
    .datum(exampleData1)
    .call(profileFlame);
```

Or a compare flame:

```
var profileFlame = d3.profileFlame()
    .compare(true);

d3.select(container)
    .datum([exampleData1, exampleData2])
    .call(profileFlame);
```

## API Refs

** compare(compareBool) **

compare switcher, when in compare mode, data passed by d3 must be an array with two items;

** width([width]) **

** height([height]) **

** cutoff([cutoff]) **

set/get cutoff threshold, entry with lower percent will be ignored. useful for those huge profiles.

** maxDepth([maxDepth])

set/get max depth of stacks


** specifiedEntries(entriesArray) **

set/get array of specified entries, will only render stacks with these entries.

** search(kw) **

set search keyword, those entries matched will be render in purple.

** reset() **

reset flame to origin state

** reverseCompare() **

reverse the two data items comparing

** compareMethod([method]) **

set/get compare method, allowed mode:

* cumulative
* internal

** backward() **

go backward on focus histories

** forward() **

go forward on focus histories

