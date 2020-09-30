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
 - Send a closure message on Close() call, allow ZMQResponder and ZMQPublisher to free memory
 - ZeroMQ will still deliver messages post setting linger to zero and calling close, this might be caused by messages already being picked up by the socket and ready to be received on the next iteration of the event loop. Options on how to handle this:
   - Allow messages to be delivered post Close() call, bad idea
   - Wrap the asyncIterator or replace it with a looped calls to receive(), annoying but shouldn't have major side effects or performance impact
 
### Ideas:
 - Mock zmq functionality
   - No port conflicts
   - No network issues
   - In-memory messaging

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
 - ExpiryMap does not reset expiry when `set()` overwrites an existing value. Would require a LinkedListDictionary.
