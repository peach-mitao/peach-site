// 官网唯一的动态入口。只有 /api/event 会进入 Worker（见 cloudflare.config.ts 的 runWorkerFirst），
// 其余请求由静态资源直接返回；这里的兜底只是原样转给静态资源。
// Workers 把模块的每个具名导出当作入口，解析逻辑放在 events.ts，这里只保留默认导出。
import {EVENT_PATH, handleEvent, type EdgeRequest,type Env} from './events.ts';

export default {
  fetch(request: EdgeRequest, env: Env) {
    return new URL(request.url).pathname === EVENT_PATH ? handleEvent(request, env) : env.ASSETS.fetch(request);
  },
};
