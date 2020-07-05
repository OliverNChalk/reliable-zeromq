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

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
