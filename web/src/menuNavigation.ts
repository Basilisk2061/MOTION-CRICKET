import type { GameMode } from './gameMode'
export type MenuPage = 'MAIN' | 'PLAY' | 'BATTING' | 'BOWLING' | 'TRAINING' | 'RECORDS' | 'SETTINGS'
export type MenuChoice = { label: string; page?: MenuPage; mode?: GameMode; lab?: boolean; description?: string }
export const MENU_CHOICES: Record<MenuPage, MenuChoice[]> = {
 MAIN: [{label:'PLAY',page:'PLAY'},{label:'TRAINING',page:'TRAINING'},{label:'RECORDS',page:'RECORDS'},{label:'SETTINGS',page:'SETTINGS'}],
 PLAY: [{label:'BATTING',page:'BATTING'},{label:'BOWLING',page:'BOWLING'}],
 BATTING: [{label:'FREE PLAY',mode:'FREE_PLAY',description:"Bat until you're out."},
  {label:'TARGET CHASE',mode:'TARGET_CHASE',description:'Chase the target before the balls run out.'}],
 BOWLING: [{label:'BOWLING LAB',lab:true,description:'Experimental phone-controlled bowling'}],
 TRAINING: [], RECORDS: [], SETTINGS: [],
}
export function menuBack(page: MenuPage): MenuPage {
 return page==='BATTING'||page==='BOWLING'?'PLAY':'MAIN'
}
