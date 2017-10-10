# OSM Replication Streams

Among other things, this is a set of Stream implementations that fetch
OpenStreetMap changes and changesets, convert them from XML (their native
format) into JSON, and facilitate management and use of them using AWS Kinesis
and Azure Event Hubs.

## Changeset Analytics

This aims to aggregate OSM data by changeset (which, despite the name, aren't
atomic units) using a [Kappa architecture](http://milinda.pathirage.org/kappa-architecture.com/).

Since changesets are published (by OSM) as a separate replication stream from
changes, ordering is even less predictable than we'd hope. Replication occurs as
a minutely batch process, so some state changes that occur within that window
are not visible to consumers.

Changes are received in chronological order. Changesets are also received in
chronological order, but may be either "open" (where additional changes may be
added) or "closed" (all changes have been made).

When changesets are received as "open", they will later be received again when
closed. JOSM is the primary editor responsible for long-lived changesets.

When changes are received as "closed" (but not "open"), it is likely that the
changeset was opened, had changes added to it, and was closed within the window
between OSM-side replication batches. Alternately, the changeset was opened
prior to the beginning of the stream.

> `lastChangeset`

Changesets must have been opened in order for changes to be created. However,
because changes are published on a different stream, they may appear before the
changeset. For this reason, we keep store changes with changeset ids greater
than the highest changeset id we've seen in a cache with a 5 minute TTL so that
they can later be re-associated if the changeset is deemed to be of-interest.

For the same reason, changesets are not considered finalized until 5 minutes
after they're closed (although they will be emitted with aggregate statistics,
meaning that you may see the same changeset repeatedly as additional data is
tacked on), allowing elements received after the closure was received to be
incorporated.

Changeset checksums are calculated for each changeset so that it can be checked
against an external source (e.g., OSM itself or a planet file). The checksum
consists of the following elements:

* changeset id
* all contained nodes, using both their id and version
* all contained ways, using both their id and version
* all contained relations, using both their id and version

The raw input for a changeset checksum looks like this:

```json
{
  "id": 1234,
  "nodes": [
    [12345, 3]
  ],
  "relations": [
    [12345, 4]
  ],
  "ways": [
    [12345, 5]
  ]
}
```

Keys are sorted lexicographically prior to being serialized as JSON. Once
converted to text, the SHA1 (?) is calculated and used as the checksum.

### Identifying Changesets of Interest

Limiting the number of changesets that are marked as interesting will reduce the
amount of processing that needs to occur.

#### Hashtags

Hashtags are the primary way that Missing Maps tracks mapper activity. They can
be extracted from the `comment` tag, or where possible, from the `hashtags` tag.

#### User

Changesets can be marked as being of interest if their `uid` property matches a
list of known users.

#### Content

Changesets can be tracked if their `comment` tag includes "interesting" strings.

They can also be tracked according to tags of elements included in the changeset
(but not necessarily the tags of elements associated with elements in the
changeset without lookups).

### Types of Statistics

#### Raw Counts

Raw counts can be summarized for each changeset: e.g. buildings added
(`version == 1`, though multiple edits in a long-running changeset will produce
a higher version), modified (`version > 1`), or deleted (`visible = false` or
`action = "delete"`).

To configure, provide an iD-style preset to match:

```json
{
  "buildings": {
    "stats": [
      "count"
    ],
    "geometry": [
      "point",
      "area"
    ],
    "tags": {
      "building": "*"
    }
  }
}
```

This will count all nodes (`point`), ways, or relations (`area`) with `building`
set to something. Differentiation between open/closed ways (lines / areas) is
irrelevant, as all we care about is the number of elements included in the
changeset (not their children).

#### Way Lengths

Way lengths (for new and deleted ways) can be calculated (roads are also counted
in this example):

```json
{
  "buildings": {
    "stats": [
      "count",
      "length"
    ],
    "geometry": [
      "line"
    ],
    "tags": {
      "highway": "*"
    }
  }
}
```

Lengths are not calculated for modified ways, as those edits may be a
combination of metadata updates (such as renaming, which does not affect the
geometry) and node adjustments (which are not reflected in the way itself and
cannot be matched to the preset without looking up ways that include them, as
they typically do not carry tags that will match).

In order to assemble way geometries, member nodes need to be looked up. In many
cases these nodes will have been created in the same changeset, but when
attaching ways together using shared nodes, they may not have appeared in the
change stream recently. For this reason, we need to look up

#### Complexity

tk - tracks the number of way `nds` or relation `members` (grouped by `role`).

#### Node Nudges

Useful for validation.

tk - distance nodes were moved (requires also having the previous version of the node)

#### Tag Changes

Useful for validation and notification.

tk - diffs between nodes included in element versions (requires having the previous version of the way)

#### Membership Changes

Useful for validation and user profiling (counts).

tk - `nds` diff, `members` diff

#### Bounding Area

Since changesets can incorporate changes that are geographically diverse,
calculating the minimum bounding rectangle (MBR) of the changeset is not useful.
Instead, we track each of the nodes that were modified. N.b. that this means
edits to ways and relations do not expand the bounding area.

The resulting collection of nodes can be visualized as a heatmap.

#### Behavioral Patterns

Tracking editor behavior over time can be a powerful way to encourage new
mappers. Similarly, it can be used to detect abuse, i.e. when a new account is
suddenly used to make a large number of substantial edits.

These are (probably?) best modeled as functions with additional context provided
with the changeset:

* user created_at
* user's number of edits
* user's area of influence
* commonly used tags
* typical time of day

(Incidentally, these are additional metrics that could be tracked to display
information about that user's edits.)

#### Editor Used

tk

#### Locale

tk

#### Imagery Used

tk

### Backfilling Statistics

Unless simultaneously replaying both a history dump (where elements will not be
in changeset order) and a changeset dump, changeset statistics will necessarily
have a starting point (limited to the beginning of available replication
streams; years ago if using OSM replication files, likely within the past week
if consuming a stream from Kinesis or Event Hubs).

It is also occasionally useful to compare streamed statistics with a more
durable source of truth (such as OSM itself or a planet dump).

For these reasons, it makes sense to be able to run similar analysis on
historical data to seed or validate the statistics database. Use of the [OSM ORC
files](https://github.com/mojodna/osm2orc) may be the most effective way of
achieving this. Raw counts can be produced using Athena queries like this one:

```sql
tk
```

Way measurement is more complicated. Nodes making up ways of interest (tied to
their corresponding changeset) can be gathered using a query like this, but
post-processing is necessary to convert the list of node coordinates into a
`LineString` and measuring it:

```sql
tk
```

For tracking changes between element versions, window functions are useful. This
shows how nodes were moved in a given changeset:

```sql
tk
```

This shows how tags changed:

```sql
tk
```
