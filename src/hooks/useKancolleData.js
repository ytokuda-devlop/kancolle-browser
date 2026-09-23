/*
 * Electronのpreload経由で艦これのゲームデータを購読するカスタムフック。
 * 艦隊・入渠・建造・任務・資材・出撃情報の初期取得、更新反映、購読解除を一括して管理する。
 */
import { useEffect, useState } from 'react';

const INITIAL_MATERIAL_DATA = {
  fuel: 0,
  ammo: 0,
  steel: 0,
  bauxite: 0,
  devco: 0,
  screw: 0,
  bucket: 0,
  burner: 0,
  mamiya: 0,
  irako: 0,
  shipCount: 0,
  maxShips: 0,
  slotItemCount: 0,
  maxSlotItems: 0
};

function useKancolleData() {
  const [fleetData, setFleetData] = useState([]);
  const [ndockData, setNdockData] = useState([]);
  const [kdockData, setKdockData] = useState([]);
  const [questData, setQuestData] = useState([]);
  const [sortieData, setSortieData] = useState(null);
  const [materialData, setMaterialData] = useState(INITIAL_MATERIAL_DATA);

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI) return undefined;

    const unsubscribeFleet = electronAPI.onFleetData(data => {
      if (data && data.length > 0) setFleetData(data);
    });
    const unsubscribeNdock = electronAPI.onNdockData(data => {
      if (data) setNdockData(data);
    });
    const unsubscribeKdock = electronAPI.onKdockData(data => {
      if (data) setKdockData(data);
    });
    const unsubscribeQuest = electronAPI.onQuestData(data => {
      if (data) setQuestData(data);
    });
    const unsubscribeMaterial = electronAPI.onMaterialData(data => {
      if (data) setMaterialData(data);
    });
    const unsubscribeSortie = electronAPI.onSortieData(data => {
      setSortieData(data || null);
    });

    electronAPI.getFleetData();
    electronAPI.getNdockData();
    electronAPI.getKdockData();
    electronAPI.getQuestData();
    electronAPI.getMaterialData();
    electronAPI.getSortieData();

    return () => {
      unsubscribeFleet?.();
      unsubscribeNdock?.();
      unsubscribeKdock?.();
      unsubscribeQuest?.();
      unsubscribeMaterial?.();
      unsubscribeSortie?.();
    };
  }, []);

  return {
    fleetData,
    ndockData,
    kdockData,
    questData,
    sortieData,
    materialData
  };
}

export default useKancolleData;
