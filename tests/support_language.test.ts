import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSiteLanguage} from '../browser/assets/site-language.ts';

test('支持页按显式语言、版本地址、保存偏好与浏览器顺序选择',()=>{
 assert.equal(resolveSiteLanguage({path:'/missing',languages:['zh-TW','en']}),'zh');
 assert.equal(resolveSiteLanguage({path:'/missing',languages:['ja','en','zh']}),'en');
 assert.equal(resolveSiteLanguage({path:'/missing',languages:['ja']}),'en');
 assert.equal(resolveSiteLanguage({path:'/missing',saved:'zh',languages:['en']}),'zh');
 assert.equal(resolveSiteLanguage({path:'/en/missing',saved:'zh',languages:['zh']}),'en');
 assert.equal(resolveSiteLanguage({path:'/en/missing',explicit:'zh',saved:'en',languages:['en']}),'zh');
 assert.equal(resolveSiteLanguage({path:'/missing',explicit:'invalid',saved:'invalid',languages:[]}),'en');
});
