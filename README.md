# Reliable ZeroMQ
[![Build Status](https://travis-ci.com/OliverNChalk/reliable-zeromq.svg?branch=master)](https://travis-ci.com/OliverNChalk/reliable-zeromq)
[![codecov](https://codecov.io/gh/OliverNChalk/reliable-zeromq/branch/master/graph/badge.svg)](https://codecov.io/gh/OliverNChalk/reliable-zeromq)

### TODO:
 - Test what happens when two sockets bind to the same endpoint
 - Register ErrorHandler for HWM
 - Performance Testing
 - Migrate to ESLint
 - Test multiple subscribers to one publisher (networked)
 - Separate Ack + Response in ZMQResponse to distinguish between slow peers and slow endpoints?
 - Detect expired requests in ZMQResponse, currently it will attempt to process that request again.

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
 - ExpiryMap does not reset expiry when `set()` overwrites an existing value. Could be done by storing a timestamp in the map of the last edit. Then when a timestamp expires out of the queue, we first check if the map hasn't been edited since and if it has we can do something (note, simply pushing an expiry to the back of the queue would result in it expiring late).
