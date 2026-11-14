//! NEP-297 events. Every state change emits one line `EVENT_JSON:{...}` that indexers
//! and the Reins dashboard read; the contract keeps no payment history in state.
use near_sdk::env;
use near_sdk::serde_json::{json, Value};

pub const STANDARD: &str = "reins";
pub const VERSION: &str = "1.0.0";

pub fn emit(event: &str, data: Value) {
    let line = json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{line}"));
}
