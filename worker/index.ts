// 所有请求先检查服务地区，分析入口与后台由 Worker 处理。
// Workers 把模块的每个具名导出当作入口，解析逻辑放在 events.ts，这里只保留默认导出。
import {EVENT_PATH, handleEvent, type EdgeRequest,type Env} from './events.ts';
import {behaviorRequest,expireBehavior,type BehaviorEnv} from './behavior.ts';
import {regionResponse} from './region.ts';

export default {
  async fetch(request: EdgeRequest, env: Env&BehaviorEnv) {
    const restricted = await regionResponse(request, env.ASSETS);
    if (restricted) return restricted;
    return await behaviorRequest(request,env) ?? (new URL(request.url).pathname === EVENT_PATH ? handleEvent(request, env) : env.ASSETS.fetch(request));
  },
  async scheduled(_controller:unknown,env:BehaviorEnv){await expireBehavior(env)},
};
