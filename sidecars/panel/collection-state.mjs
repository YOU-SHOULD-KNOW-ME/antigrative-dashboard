// Safe, numeric collection diagnostics; never carries raw API text or credentials.
const messages={'retained-fields':'会话统计数据超过采集上限','projected-json':'会话统计数据超过内存预算',field:'会话统计字段超过采集上限'};
export function budgetError(kind,observed,limit){
 const error=new Error(messages[kind]||messages['retained-fields']);
 error.collection={code:'budget-exceeded',kind,unit:kind==='field'?'characters':'bytes',observed,limit,complete:false};
 return error;
}
export function collectionFailure(error){
 const value=error?.collection;
 if(value?.code!=='budget-exceeded'||!Object.hasOwn(messages,value.kind))return null;
 const out={state:'limited',code:value.code,kind:value.kind,unit:value.kind==='field'?'characters':'bytes',complete:false};
 for(const key of ['limit','observed'])if(Number.isSafeInteger(value[key])&&value[key]>=0){out[key]=value[key];if(out.unit==='bytes')out[key+'Bytes']=value[key];}
 out.retryAt=typeof value.retryAt==='string'&&Number.isFinite(Date.parse(value.retryAt))?value.retryAt:null;
 return out;
}
