/** Format files from an update check. Native test builds return no file lists. */
export function formatUpdateFiles(info) {
 if (!info?.available) return [];
 const changed=Array.isArray(info.changed_files)?info.changed_files:[];
 const removed=Array.isArray(info.removed_files)?info.removed_files:[];
 return [...changed,...removed.map(file=>file+' (removed)')];
}
