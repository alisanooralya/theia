export const DU_ENGINE_SOURCE = `
(function(global){
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function clone(o){return JSON.parse(JSON.stringify(o))}
  function shuffle(values,rng){var result=values.slice();for(var i=result.length-1;i>0;i--){var j=Math.floor(rng()*(i+1));var tmp=result[i];result[i]=result[j];result[j]=tmp}return result}
  function sample(values,count,rng){return shuffle(values,rng).slice(0,count)}
  function totalEffects(state,data){
    var effects={};var owned=[];
    for(var i=0;i<state.blessings.length;i++){for(var b=0;b<data.blessings.length;b++){if(data.blessings[b].id===state.blessings[i]){owned.push(data.blessings[b]);break}}}
    for(var j=0;j<state.curios.length;j++){for(var c=0;c<data.curios.length;c++){if(data.curios[c].id===state.curios[j]){owned.push(data.curios[c]);break}}}
    for(var k=0;k<owned.length;k++){var item=owned[k];for(var key in item){if(typeof item[key]==='number'){effects[key]=(effects[key]||0)+item[key]}if(item[key]===true){effects[key]=true}}}
    return effects;
  }
  function maxHp(state,data){return Math.max(50,state.baseMaxHp+(totalEffects(state,data).maxHp||0))}
  function addFragments(state,amount,data){var mult=1+(totalEffects(state,data).fragmentMult||0);var gained=Math.floor(amount*mult);state.fragments+=gained;return gained}
  function heal(state,amount,data){var before=state.hp;state.hp=Math.min(maxHp(state,data),state.hp+Math.floor(amount));return state.hp-before}
  function availableBlessings(state,count,data,rng){
    count=count||3;var remaining=[];
    for(var i=0;i<data.blessings.length;i++){if(state.blessings.indexOf(data.blessings[i].id)===-1){remaining.push(data.blessings[i])}}
    var effects=totalEffects(state,data);
    if(!effects.pathBias){return sample(remaining,count,rng)}
    var matching=[];var others=[];
    for(var j=0;j<remaining.length;j++){if(remaining[j].path===state.path){matching.push(remaining[j])}else{others.push(remaining[j])}}
    matching=shuffle(matching,rng);others=shuffle(others,rng);
    return matching.concat(others).slice(0,count);
  }
  function availableCurios(state,count,data,rng){
    count=count||3;var remaining=[];
    for(var i=0;i<data.curios.length;i++){if(state.curios.indexOf(data.curios[i].id)===-1){remaining.push(data.curios[i])}}
    return sample(remaining,count,rng);
  }
  function grantBlessing(state,data,rng){var b=availableBlessings(state,1,data,rng)[0];if(!b){return null}state.blessings.push(b.id);return b}
  function grantCurio(state,data,rng){var c=availableCurios(state,1,data,rng)[0];if(!c){return null}state.curios.push(c.id);if(c.instantHeal){heal(state,c.instantHeal,data)}if(c.instantFragments){state.fragments+=c.instantFragments}state.hp=Math.min(state.hp,maxHp(state,data));return c}
  function grantRandomCurio(state,data,rng){
    var available=[];for(var i=0;i<data.curios.length;i++){if(state.curios.indexOf(data.curios[i].id)===-1){available.push(data.curios[i])}}
    if(!available.length){return null}
    var curio=available[Math.floor(rng()*available.length)];
    state.curios.push(curio.id);
    if(curio.instantHeal){heal(state,curio.instantHeal,data)}
    if(curio.instantFragments){state.fragments+=curio.instantFragments}
    state.hp=Math.min(state.hp,maxHp(state,data));
    return curio;
  }
  function countCleared(state){var n=0;for(var i=0;i<state.nodes.length;i++){if(state.nodes[i].cleared){n++}}return n}
  function battle(state,node,data,rng){
    var effects=totalEffects(state,data);
    var relic=state.relicEffects||{};
    var diffConfig=data.difficulty[state.difficulty]||data.difficulty.medium;
    var tier=node.type==='boss'?1.6:(node.type==='elite'?1.3:1);
    var progress=1+node.position*0.045;
    var relicDefBonus=Math.floor((state.baseMaxHp||100)*(relic.def_percent||0));
    var shield=(effects.shield||0)+(state.path==='preservation'?5:0)+relicDefBonus;
    var reduction=Math.min(0.6,(effects.reduction||0)+(state.path==='preservation'?0.08:0));
    var damageMultiplier=diffConfig.damageMultiplier||1;
    var enemyMultiplier=diffConfig.enemyMultiplier||1;
    var enemyPower=tier*progress*(1-(effects.weaken||0))*(1+(effects.enemyPower||0))*enemyMultiplier;
    var baseWinChance=diffConfig.baseWinChance||0.7;
    var relicCritRate=relic.crit_rate||0;
    var critChance=Math.min(0.55,0.12+(effects.crit||0)+relicCritRate);
    var rounds=0,totalDamageTaken=0,lastCrit=false,battleLog=[];
    while(state.hp>0){
      rounds++;
      var playerPower=1+(effects.atk||0)+(relic.atk_flat||0)*0.01;
      if(state.hp/maxHp(state,data)<0.6&&state.path==='destruction'){playerPower+=0.18}
      if(node.type!=='battle'){playerPower+=effects.bossAtk||0}
      playerPower+=Math.floor(state.blessings.length/3)*(effects.perBlessing||0);
      var crit=rng()<critChance;
      lastCrit=crit;
      if(crit){playerPower*=1.5+(effects.critDamage||0)}
      var winChance=Math.max(0.48,Math.min(0.94,baseWinChance+(playerPower-enemyPower)*0.18));
      var won=rng()<winChance;
      var damage=Math.floor((won?13:27)*tier*progress*(1-reduction)*(1+(effects.incomingDamage||0))*damageMultiplier);
      if(rng()<Math.min(0.4,effects.dodge||0)){damage=0}
      damage=Math.max(0,damage-shield);
      state.hp=Math.max(0,state.hp-damage);
      totalDamageTaken+=damage;
      battleLog.push({round:rounds,crit:crit,hit:damage>0,damage:damage,hp:state.hp});
      if(won){
        if(effects.revive&&!state.revived&&state.hp<=0){
          state.revived=true;state.hp=35;
          state.lastResult='Revival Chip aktif. Kamu kalah dari '+node.name+', tetapi bangkit dengan 35 HP.';
          return {battle:battleLog,result:'revive'};
        }
        if(state.hp<=0){
          state.lastResult='RUN GAGAL: Kamu dikalahkan '+node.name+' di node '+node.position+'/'+state.nodes.length+' pada ronde '+rounds+'.\\nNode clear: '+countCleared(state)+'/'+state.nodes.length+' | Fragment hangus.';
          state.pending=null;
          return {battle:battleLog,result:'fail'};
        }
        var reward=data.baseReward[node.type];
        var gained=addFragments(state,reward.fragments+(effects.fragments||0),data);
        var restored=heal(state,(effects.heal||0)+(state.path==='abundance'?5:0),data);
        var options=availableBlessings(state,3,data,rng);
        state.pending={type:'blessing',options:options.map(function(x){return x.id})};
        var lines=[(lastCrit?'Critical! ':'')+node.name+' dikalahkan dalam *'+rounds+' ronde*.','Total damage diterima: -'+totalDamageTaken+' | HP: '+state.hp+'/'+maxHp(state,data),(restored?'Pemulihan: +'+restored+' HP':''),'Fragment +'+gained+'.'];
        if(node.type==='elite'||node.type==='boss'){
          var curio=grantRandomCurio(state,data,rng);
          if(curio){var errorTag=curio.error?' [ERROR]':'';lines.push('Curio diterima: *'+curio.name+'*'+errorTag+' - '+curio.text)}
        }
        lines.push('Pilih satu Blessing.');
        state.lastResult=lines.filter(function(x){return x!==''&&x!==undefined}).join('\\n');
        return {battle:battleLog,result:'win'};
      }
      if(state.hp<=0){
        if(effects.revive&&!state.revived){
          state.revived=true;state.hp=35;
          state.lastResult='Revival Chip aktif. Kamu kalah dari '+node.name+' dalam '+rounds+' ronde, tetapi bangkit dengan 35 HP.';
          return {battle:battleLog,result:'revive'};
        }
        state.lastResult='RUN GAGAL: Kamu dikalahkan '+node.name+' di node '+node.position+'/'+state.nodes.length+' dalam *'+rounds+' ronde*.\\nNode clear: '+countCleared(state)+'/'+state.nodes.length+' | Fragment hangus.';
        state.pending=null;
        return {battle:battleLog,result:'fail'};
      }
    }
    return {battle:battleLog,result:'unknown'};
  }
  function openTreasure(state,node,data,rng){
    var gained=addFragments(state,120,data);
    var options=availableCurios(state,3,data,rng);
    if(!options.length){state.lastResult=node.name+' berisi '+gained+' fragment. Semua Curio sudah dimiliki.';advance(state);return}
    state.pending={type:'curio',options:options.map(function(x){return x.id})};
    state.lastResult=node.name+' dibuka. Fragment +'+gained+'. Pilih satu Curio.';
  }
  function openEvent(state,node,data){
    var options=data.eventScenarios[node.name]||data.eventScenarios['Ruan Mei Replica'];
    state.pending={type:'event',eventName:node.name,options:options};
    state.lastResult=node.name+' menawarkan tiga kemungkinan.';
  }
  function resolveEvent(state,option,data,rng){
    function eventHeal(amount){return heal(state,amount*(1+(totalEffects(state,data).eventHeal||0)),data)}
    function spend(amount){if(state.fragments<amount){throw new Error('Butuh '+amount+' fragment untuk pilihan ini.')}state.fragments-=amount}
    function addMaxHp(amount){state.baseMaxHp+=amount;state.hp+=amount}
    function randomBlessing(){return grantBlessing(state,data,rng)}
    function randomCurio(){return grantCurio(state,data,rng)}
    switch(option.id){
      case 'research':{var b=randomBlessing();var g=addFragments(state,60,data);state.lastResult=b?'Penelitian berhasil: '+b.name+' dan '+g+' fragment diperoleh.':'Penelitian menghasilkan '+g+' fragment.';break}
      case 'ruan_rest':state.lastResult='Replika memulihkan '+eventHeal(40)+' HP.';break;
      case 'ruan_leave':state.lastResult='Kamu pergi membawa '+addFragments(state,120,data)+' fragment.';break;
      case 'light':spend(80);state.lastResult='Cahaya kembali. '+eventHeal(maxHp(state,data))+' HP dipulihkan.';break;
      case 'darkness':state.hp=Math.max(1,state.hp-22);state.lastResult='Kegelapan mengambil 22 HP. Kamu memperoleh '+addFragments(state,260,data)+' fragment.';break;
      case 'wait':state.lastResult='Kamu menunggu dan memulihkan '+eventHeal(20)+' HP.';break;
      case 'trade':{spend(100);var t=randomBlessing();if(!t){state.fragments+=100}state.lastResult=t?'100 fragment ditukar dengan Blessing '+t.name+'.':'Semua Blessing sudah dimiliki. Fragment dikembalikan.';break}
      case 'buy_curio':{spend(160);var c=randomCurio();if(!c){state.fragments+=160}state.lastResult=c?'Kotak dibuka dan berisi '+c.name+'. '+c.text:'Semua Curio sudah dimiliki. Fragment dikembalikan.';break}
      case 'merchant_gift':state.lastResult='Sampel gratis bernilai '+addFragments(state,90,data)+' fragment.';break;
      case 'chase':if(rng()<0.5){state.lastResult='Trotter tertangkap. Kamu memperoleh '+addFragments(state,320,data)+' fragment.';}else{state.hp=Math.max(1,state.hp-20);state.lastResult='Trotter lolos dan kamu kehilangan 20 HP.';}break;
      case 'feed':spend(60);addMaxHp(10);state.lastResult='Trotter memberimu berkah: max HP +10.';break;
      case 'trotter_leave':state.lastResult='Trotter meninggalkan energi yang memulihkan '+eventHeal(25)+' HP.';break;
      case 'mirror_blessing':{state.hp=Math.max(1,state.hp-15);var mb=randomBlessing();state.lastResult=mb?'Pantulan mengambil 15 HP dan memberikan '+mb.name+'.':'Pantulan mengambil 15 HP, tetapi tidak ada Blessing tersisa.';break}
      case 'mirror_shatter':state.lastResult='Pecahan cermin berubah menjadi '+addFragments(state,180,data)+' fragment.';break;
      case 'mirror_restore':state.lastResult='Ingatan pulih bersama '+eventHeal(35)+' HP.';break;
      case 'donate':spend(120);addMaxHp(15);state.lastResult='Para arsitek memperkuat tubuhmu: max HP +15.';break;
      case 'work':state.hp=Math.max(1,state.hp-10);state.lastResult='Pekerjaan menghabiskan 10 HP dan menghasilkan '+addFragments(state,170,data)+' fragment.';break;
      case 'shelter':state.lastResult='Shelter memulihkan '+eventHeal(30)+' HP.';break;
      case 'jackpot':if(rng()<0.5){state.lastResult='Jackpot! Kamu memperoleh '+addFragments(state,280,data)+' fragment.';}else{var lost=Math.min(120,state.fragments);state.fragments-=lost;state.lastResult='Mesin rusak. Kamu kehilangan '+lost+' fragment.';}break;
      case 'repair':{state.hp=Math.max(1,state.hp-12);var rb=randomBlessing();state.lastResult=rb?'Mesin aktif setelah mengambil 12 HP dan memberikan '+rb.name+'.':'Mesin mengambil 12 HP, tetapi tidak ada Blessing tersisa.';break}
      case 'arcade_leave':state.lastResult='Kabel berisi '+addFragments(state,70,data)+' fragment.';break;
      case 'answer_signal':{var ac=randomCurio();state.lastResult=ac?'Sinyal mengirim '+ac.name+'. '+ac.text:'Sinyal kosong karena semua Curio sudah dimiliki.';break}
      case 'decode_signal':{var db=randomBlessing();state.lastResult=db?'Sinyal terdekode menjadi Blessing '+db.name+'.':'Sinyal tidak menghasilkan Blessing baru.';break}
      case 'sell_signal':state.lastResult='Koordinat terjual seharga '+addFragments(state,150,data)+' fragment.';break;
      default:throw new Error('Pilihan event tidak dikenali.');
    }
  }
  function advance(state){
    var node=state.nodes[state.nodeIndex];
    if(node){node.cleared=true}
    state.pending=null;
    state.nodeIndex+=1;
  }
  function computeReward(state,data){
    var effects=totalEffects(state,data);
    var diffConfig=data.difficulty[state.difficulty]||data.difficulty.medium;
    var multiplier=diffConfig.rewardMultiplier;
    var cash=Math.floor((data.finalReward.baseCash+state.fragments*data.finalReward.cashPerFragment)*(1+(effects.cashMult||0))*multiplier);
    var exp=Math.floor((data.finalReward.baseExp+state.blessings.length*data.finalReward.expPerBlessing)*multiplier);
    var cerelia=Math.floor((state.difficulty==='easy'?2:state.difficulty==='medium'?4:6)*multiplier);
    return {cash:cash,exp:exp,cerelia:cerelia};
  }
  function makeDU(data){
    function create(seed,initState,saved){
      var state=saved&&saved.state?clone(saved.state):clone(initState);
      var baseRng=mulberry32((seed>>>0)||1);
      var rngCount=saved&&saved.rngCount?Number(saved.rngCount):0;
      var rng;
      function makeRng(){
        var _rng=baseRng;
        return function(){rngCount++;return _rng()}
      }
      rng=makeRng();
      for(var k=0;k<rngCount;k++){baseRng()}
      var actions=saved&&saved.actions?clone(saved.actions):[];
      var status=saved&&saved.status?saved.status:'active';
      function actPath(id){
        if(state.path){throw new Error('Path run ini sudah dipilih.')}
        if(!data.paths[id]){throw new Error('Path tidak tersedia.')}
        state.path=id;state.pending=null;
        if(id==='abundance'){state.baseMaxHp+=10;state.hp+=10}
        state.lastResult='Sinkronisasi Path '+data.paths[id].name+' berhasil.';
        actions.push({t:'path',v:id});
      }
      function actExplore(){
        if(!state.path){throw new Error('Pilih Path dahulu.')}
        if(state.pending){throw new Error('Selesaikan pilihan yang tertunda.')}
        var node=state.nodes[state.nodeIndex];
        if(!node){throw new Error('Semua node pada run ini sudah selesai.')}
        actions.push({t:'explore'});
        var battleResult=null;
        if(node.type==='event'){openEvent(state,node,data)}
        else if(node.type==='treasure'){openTreasure(state,node,data,rng)}
        else{battleResult=battle(state,node,data,rng);if(battleResult.result==='fail'){status='failed'}}
        return battleResult;
      }
      function actChoose(index){
        var pending=state.pending;
        if(!pending||pending.type==='path'){throw new Error('Tidak ada pilihan aktif.')}
        var choice=Number(index);
        if(!(choice>=0&&choice<pending.options.length)){throw new Error('Pilihan tidak valid.')}
        actions.push({t:'choose',v:choice});
        if(pending.type==='blessing'){
          var blessing=null;for(var i=0;i<data.blessings.length;i++){if(data.blessings[i].id===pending.options[choice]){blessing=data.blessings[i];break}}
          state.blessings.push(blessing.id);
          state.lastResult='Blessing diperoleh: '+blessing.name+'. '+blessing.text;
        }else if(pending.type==='curio'){
          var curio=null;for(var j=0;j<data.curios.length;j++){if(data.curios[j].id===pending.options[choice]){curio=data.curios[j];break}}
          state.curios.push(curio.id);
          if(curio.instantHeal){heal(state,curio.instantHeal,data)}
          if(curio.instantFragments){state.fragments+=curio.instantFragments}
          state.hp=Math.min(state.hp,maxHp(state,data));
          state.lastResult='Curio diperoleh: '+curio.name+'. '+curio.text;
        }else if(pending.type==='event'){
          resolveEvent(state,pending.options[choice],data,rng);
        }
        advance(state);
        if(state.nodeIndex>=state.nodes.length){status='completed'}
        return null;
      }
      return {
        get state(){return state},
        get status(){return status},
        get actions(){return actions},
        actPath:actPath,
        actExplore:actExplore,
        actChoose:actChoose,
        getMaxHp:function(){return maxHp(state,data)},
        computeReward:function(){return computeReward(state,data)},
        save:function(){
          return {state:clone(state),actions:clone(actions),status:status,rngCount:rngCount};
        }
      };
    }
    return {create:create};
  }
  global.DUEngine={makeDU:makeDU};
})(typeof globalThis!=='undefined'?globalThis:this);
`;

let cachedEngine = null;

export function getDuEngine() {
  if (cachedEngine) return cachedEngine;
  const factory = new Function(`${DU_ENGINE_SOURCE}\n; return DUEngine;`);
  cachedEngine = factory();
  return cachedEngine;
}
