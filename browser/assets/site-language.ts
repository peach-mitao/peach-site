export type SiteLanguage='zh'|'en';
export function resolveSiteLanguage(input:{path:string;explicit?:string|null;saved?:string|null;languages:readonly string[]}):SiteLanguage{
 const valid=(value:unknown):value is SiteLanguage=>value==='zh'||value==='en';
 if(valid(input.explicit))return input.explicit;
 if(/^\/en(?:\/|$)/.test(input.path))return 'en';
 if(valid(input.saved))return input.saved;
 return input.languages.map(value=>value.toLowerCase().split('-')[0]).find(valid)||'en';
}
