const {test}=require('node:test');const assert=require('node:assert/strict');
const {DataSource}=require('typeorm');const entities=require('../dist/database/entities');
const {recordConfirmedAction}=require('../dist/blockchain/confirmed-action');
const {InitialSchema1791849600000}=require('../dist/database/migrations/1791849600000-InitialSchema');
const {IsolatedProtocol1791936000000}=require('../dist/database/migrations/1791936000000-IsolatedProtocol');
test('PostgreSQL migrations, concurrent replay and rollback preserve accounting',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const db=new DataSource({type:'postgres',url:process.env.TEST_DATABASE_URL,entities:Object.values(entities),migrations:[InitialSchema1791849600000,IsolatedProtocol1791936000000],synchronize:false});
  await db.initialize();
  try{
    await db.runMigrations();
    assert.equal((await db.showMigrations()),false);
    const user=await db.getRepository(entities.User).save(db.getRepository(entities.User).create());
    const repo=db.getRepository(entities.Transaction);const hash='0x'+'7'.repeat(64);let applied=0;
    const apply=async manager=>{applied++;const credits=manager.getRepository(entities.CreditPosition);await credits.save(credits.create({userId:user.id,stashPower:'10',usedCredit:'1.123456',debtAmount:'1.123456',ltv:'0.1'}));return {};};
    await Promise.all(Array.from({length:10},()=>recordConfirmedAction(repo,user.id,hash,'borrow',31337,apply)));
    assert.equal(applied,1);assert.equal(await repo.count({where:{txHash:hash}}),1);
    assert.equal((await db.getRepository(entities.CreditPosition).findOneBy({userId:user.id})).debtAmount,'1.123456');
    const failedHash='0x'+'8'.repeat(64);
    await assert.rejects(recordConfirmedAction(repo,user.id,failedHash,'repay',31337,async manager=>{
      await manager.getRepository(entities.CreditPosition).update({userId:user.id},{debtAmount:'0'});throw new Error('rollback');
    }));
    assert.equal(await repo.count({where:{txHash:failedHash}}),0);
    assert.equal((await db.getRepository(entities.CreditPosition).findOneBy({userId:user.id})).debtAmount,'1.123456');
  }finally{await db.destroy();}
});
