/*
 * 艦隊・艦娘データからレベル、索敵、制空、艦載機数を集計するユーティリティ。
 * UIの描画処理を含めず、受け取ったゲームデータから数値だけを計算する。
 */
export function getFleetTotalLevel(ships) {
  return ships.reduce((sum, ship) => sum + ship.lv, 0);
}

export function getFleetSakuteki(ships) {
  return ships.reduce((sum, ship) => sum + ship.sakuteki, 0);
}

export function getFleetSeiku(ships) {
  return ships.reduce((sum, ship) => sum + getShipSeiku(ship), 0);
}

export function getShipTotalAircraft(ship) {
  if (!ship.slots) return 0;

  return ship.slots.reduce((sum, slot) => {
    if (slot?.isAircraft) {
      return sum + (slot.currentAircraft || 0);
    }
    return sum;
  }, 0);
}

// 個別艦娘の制空値を簡易熟練度補正付きで計算する。
export function getShipSeiku(ship) {
  if (!ship.slots) return 0;

  return Math.floor(
    ship.slots.reduce((sum, slot) => {
      if (!slot?.isAircraft || slot.tyku <= 0 || slot.currentAircraft <= 0) {
        return sum;
      }

      let seiku = slot.tyku * Math.sqrt(slot.currentAircraft);

      if (slot.alv > 0) {
        if (slot.itemType === 6 || slot.itemType === 45) {
          const bonuses = [0, 0, 2, 5, 9, 14, 14, 22];
          seiku += bonuses[slot.alv] || 0;
        } else if ((slot.itemType === 7 || slot.itemType === 8) && slot.alv === 7) {
          seiku += 3;
        }
      }

      return sum + seiku;
    }, 0)
  );
}
