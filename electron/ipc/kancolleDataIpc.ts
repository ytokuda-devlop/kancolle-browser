/*
 * React UIから要求された艦これの初期データを返信するIPCリスナーを登録するモジュール。
 * データストア内の資材・艦隊・ドック・任務・出撃情報をpreloadで公開したチャンネルへ返す。
 */
import { ipcMain } from 'electron';
import kancolleStore = require('../kancolle/store');

// UIからの初期資材データ要求
ipcMain.on('kancolle:get-material-data', (event) => {
  event.reply('kancolle:material-data', kancolleStore.getFormattedMaterials());
});

// UIからの初期艦隊データ要求
ipcMain.on('kancolle:get-fleet-data', (event) => {
  event.reply('kancolle:fleet-data', kancolleStore.getFormattedFleets());
});

// UIからの初期入渠ドックデータ要求
ipcMain.on('kancolle:get-ndock-data', (event) => {
  event.reply('kancolle:ndock-data', kancolleStore.getFormattedNdocks());
});

// UIからの初期建造ドックデータ要求
ipcMain.on('kancolle:get-kdock-data', (event) => {
  event.reply('kancolle:kdock-data', kancolleStore.getFormattedKdocks());
});

// UIからの初期進行中任務データ要求
ipcMain.on('kancolle:get-quest-data', (event) => {
  event.reply('kancolle:quest-data', kancolleStore.getFormattedQuests());
});

// UIからの初期出撃海域データ要求
ipcMain.on('kancolle:get-sortie-data', (event) => {
  event.reply('kancolle:sortie-data', kancolleStore.getFormattedSortie());
});
