use serde::{Deserialize, Serialize};
use crate::frida::{FridaBridge, HookInfo};
use crate::config::{load_config, load_default_bypass_script};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct InjectScriptParams {
    pub device_id: String,
    pub target: String,
    pub script: String,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteScriptParams {
    pub device_id: String,
    pub pid: u32,
    pub script: String,
}

#[derive(Debug, Deserialize)]
pub struct ListHooksParams {
    pub device_id: String,
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct TraceFunctionParams {
    pub device_id: String,
    pub pid: u32,
    pub module: String,
    pub function: String,
}

#[derive(Debug, Deserialize)]
pub struct MonitorApiCallsParams {
    pub device_id: String,
    pub pid: u32,
    pub api_name: String,
}

#[derive(Debug, Serialize)]
pub struct InjectScriptResult {
    pub output: String,
}

#[derive(Debug, Serialize)]
pub struct ExecuteScriptResult {
    pub output: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ListHooksResult {
    pub hooks: Vec<HookInfo>,
}

#[derive(Debug, Serialize)]
pub struct TraceFunctionResult {
    pub success: bool,
    pub trace_id: String,
}

#[derive(Debug, Serialize)]
pub struct MonitorApiCallsResult {
    pub success: bool,
    pub monitor_id: String,
}

pub async fn inject_script(params: InjectScriptParams) -> Result<InjectScriptResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    // Auto-inject bypass script if enabled
    let mut script_to_inject = params.script.clone();
    if config.bypass.auto_inject {
        let bypass_script = load_default_bypass_script(&config.bypass.bypass_type)
            .map_err(|e| e.to_string())?;
        script_to_inject = bypass_script + "\n" + &script_to_inject;
    }
    
    let output = frida.inject_script(&params.device_id, &params.target, &script_to_inject)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(InjectScriptResult { output })
}

pub async fn execute_script(params: ExecuteScriptParams) -> Result<ExecuteScriptResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let output = frida.execute_script(&params.device_id, params.pid, &params.script)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(ExecuteScriptResult { output })
}

pub async fn list_hooks(params: ListHooksParams) -> Result<ListHooksResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    let frida = FridaBridge::new(&config);
    
    let hooks = frida.list_hooks(&params.device_id, params.pid)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(ListHooksResult { hooks })
}

pub async fn trace_function(params: TraceFunctionParams) -> Result<TraceFunctionResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    
    // Create a trace script
    let trace_script = format!(
        r#"
        if (Java.available) {{
            Java.perform(function() {{
                console.log("[*] Tracing function: {} in module: {}");
                try {{
                    var targetModule = Java.use("{}");
                    if (targetModule[{}]) {{
                        Java.use("android.util.Log").i("FridaTrace", "Found function: {}");
                    }} else {{
                        Java.use("android.util.Log").w("FridaTrace", "Function not found: {}");
                    }}
                }} catch (e) {{
                    console.log("Trace error: " + e);
                }}
            }});
        }}
        "#,
        params.function, params.module, params.module, params.function, params.function, params.function
    );
    
    let frida = FridaBridge::new(&config);
    let _ = frida.execute_script(&params.device_id, params.pid, &trace_script)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(TraceFunctionResult {
        success: true,
        trace_id: format!("trace_{}", uuid::Uuid::new_v4()),
    })
}

pub async fn monitor_api_calls(params: MonitorApiCallsParams) -> Result<MonitorApiCallsResult, String> {
    let config = load_config().map_err(|e| e.to_string())?;
    
    // Create a monitoring script
    let monitor_script = format!(
        r#"
        if (Java.available) {{
            Java.perform(function() {{
                console.log("[*] Monitoring API calls: {}");
                try {{
                    var targetFunc = Module.findExportByName(null, "{}");
                    if (targetFunc) {{
                        Interceptor.attach(targetFunc, {{
                            onEnter: function(args) {{
                                console.log("[API] {} called");
                            }},
                            onLeave: function(retval) {{
                                console.log("[API] {} returned: " + retval);
                            }}
                        }});
                        console.log("[+] Successfully attached to: {}");
                    }} else {{
                        console.log("[-] Could not find: {}");
                    }}
                }} catch (e) {{
                    console.log("Monitor error: " + e);
                }}
            }});
        }}
        "#,
        params.api_name, params.api_name, params.api_name, params.api_name, params.api_name, params.api_name
    );
    
    let frida = FridaBridge::new(&config);
    let _ = frida.execute_script(&params.device_id, params.pid, &monitor_script)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(MonitorApiCallsResult {
        success: true,
        monitor_id: format!("monitor_{}", Uuid::new_v4()),
    })
}
