import {startBehavior} from './behavior-core.ts';
import {siteRules,siteState} from './behavior-rules.ts';
import {layoutVersion} from './behavior-version.ts';
const preview=new URLSearchParams(location.search).has('behavior-preview');
startBehavior({site:'site',layout:layoutVersion,endpoint:'/api/behavior',preview,rules:siteRules,state:siteState});
