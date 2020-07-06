# Reliable ZeroMQ

### TODO:
 - Introduce types for:
   - Publisher: Heartbeat
   - Publisher: Publish
   - Publisher: Recovery Request
 - Publisher: Stop Protocol (Heartbeating stops)
 - ErrorEmitter
 - Performance Testing
 - Migrate to ESLint
 - Test multiple subscribers to one publisher
 
### Ideas:
 - Mock zmq in tests to do in-memory messaging

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
