// Fail rather than round financial bigint values through JavaScript JSON numbers.
// No row contents are included in errors; decrypted bytes are cleared even on failure.
function parseBackup(bytes){
 try{return JSON.parse(bytes.toString('utf8'),(_key,value)=>{
  if(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value))throw Error('Backup integer exceeds exact JavaScript range; use a reviewed lossless restore method');
  return value;
 });}finally{bytes.fill(0);}
}
module.exports={parseBackup};
