# Reliable ZeroMQ

### TODO:
 - Publisher: Stop Protocol (Heartbeating stops)
 - ErrorEmitter
 - Performance Testing
 - Migrate to ESLint
 - Test multiple subscribers to one publisher (networked)
 - Proper config handling, Constants.ts is a bad idea
 
### Ideas:
 - Mock zmq functionality
   - No port conflicts
   - No network issues
   - In-memory messaging

### Known Issues:
 - JSONBigInt parses any string it can to bigint, e.g. "20n" to 20n, instead of its correct value of "20n"
 - ExpiryMap does not reset expiry when `set()` overwrites an existing value. Would require a LinkedListDictionary.
