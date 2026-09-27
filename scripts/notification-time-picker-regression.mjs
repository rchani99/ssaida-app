import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';
const jsx = (type, props) => ({type, props});
let state = null;
const platform = {OS: 'android'};
const changes = [];
const mocks = {
  'react': {useState: () => [state, v => {state=v;}]},
  'react/jsx-runtime': {jsx, jsxs: jsx, Fragment:'Fragment'},
  'react-native': {Modal:'Modal', Platform:platform, Pressable:'Pressable', Text:'Text', View:'View', StyleSheet:{create:s=>s}},
  '@expo/ui/community/datetime-picker': {__esModule:true,default:'Picker'},
  'lucide-react-native': {Clock3:'Clock',ChevronRight:'Chevron'},
  '@/design-system/icons': {dashboardIconProps:{}},
  '@/design-system/tokens': {dashboardTokens:{colors:{},typography:{body:{},cardTitle:{},button:{}},spacing:{8:8,12:12,16:16,20:20},radius:{normal:18},border:{card:{}},icon:{touchMin:48,size:{small:16}}}},
  '@/features/notifications/types': {parseTime:v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?{hour:+v.slice(0,2),minute:+v.slice(3)}:null},
};
const module = {exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync('src/features/notifications/notification-time-field.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>mocks[id],module,module.exports);
const render = (disabled=false) => module.exports.NotificationTimeField({label:'알림',value:'14:00',disabled,onChange:v=>changes.push(v)});
function find(n,type){if(!n)return [];if(Array.isArray(n))return n.flatMap(v=>find(v,type));return [...(n.type===type?[n.props]:[]),...find(n.props?.children,type)];}
find(render(),'Pressable')[0].onPress();
assert.equal(state.getHours(),14); assert.equal(state.getMinutes(),0);
find(render(),'Picker')[0].onDismiss(); assert.equal(state,null);assert.equal(changes.length,0);
find(render(),'Pressable')[0].onPress();
const date = new Date(2026,8,27,9,5);
find(render(),'Picker')[0].onValueChange({},date); assert.deepEqual(changes,['09:05']);assert.equal(state,null);
find(render(true),'Pressable')[0].onPress();assert.equal(state,null);assert.equal(find(render(true),'Pressable')[0].disabled,true);
platform.OS='ios';find(render(),'Pressable')[0].onPress();find(render(),'Picker')[0].onValueChange({},date);assert.equal(changes.length,1);
find(render(),'Pressable')[1].onPress();assert.equal(state,null);assert.equal(changes.length,1);
find(render(),'Pressable')[0].onPress();find(render(),'Picker')[0].onValueChange({},date);find(render(),'Pressable')[2].onPress();assert.deepEqual(changes,['09:05','09:05']);
console.log('PASS: initial time, HH:mm confirm, Android/iOS cancel, iOS explicit confirm, disabled field; selection only calls local onChange');
