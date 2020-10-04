# Reliable ZeroMQ
[![Build Status](https://travis-ci.com/OliverNChalk/reliable-zeromq.svg?branch=master)](https://travis-ci.com/OliverNChalk/reliable-zeromq)
[![codecov](https://codecov.io/gh/OliverNChalk/reliable-zeromq/branch/master/graph/badge.svg)](https://codecov.io/gh/OliverNChalk/reliable-zeromq)

### TODO:
 - Test what happens when two sockets bind to the same endpoint
 - Migrate to ESLint
 - Test multiple subscribers to one publisher (networked)
 - Separate Ack + Response in ZMQResponse to distinguish between slow peers and slow endpoints?
 - Send a closure message on Close() call, allow ZMQResponder and ZMQPublisher to free memory
 - Default to throwing unhandled errors and suppressing warns
 
### Ideas:
 - Mock zmq functionality
   - No port conflicts
   - No network issues
   - In-memory messaging

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
 - ExpiryMap does not reset expiry when `set()` overwrites an existing value. Would require a LinkedListDictionary.
