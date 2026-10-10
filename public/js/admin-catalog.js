(async () => {
  'use strict';

  const {
    api, el, replaceChildren, formatPrice, formatDate,
    showFieldErrors, toast, handleError, confirm: confirmDialog,
  } = BoxTick;

  const mode = document.body.dataset.adminCatalog;
  if (!mode) return;

  await BoxTickAdmin.initAdminPage({
    active: mode,
    hints: [{ key:'B', label:'대시보드', href:'/admin/' }],
  });

  const form = document.getElementById('editor-form');
  const list = document.getElementById('item-list');
  const resultCount = document.getElementById('result-count');
  const editorTitle = document.getElementById('editor-title');
  const editorState = document.getElementById('editor-state');
  const deleteButton = document.querySelector('[data-delete]');
  const newButton = document.querySelector('[data-new]');
  const resetButton = document.querySelector('[data-reset]');

  let sets = [];
  let cards = [];
  let selectedId = null;
  let selectedTargetId = null;
  let currentRecords = [];

  function localToday() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function numberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    return Number(value);
  }

  function setEditor(editing, title) {
    editorTitle.textContent = title;
    editorState.textContent = editing ? 'EDIT' : 'NEW';
    deleteButton.hidden = !editing;
  }

  function clearErrors() {
    showFieldErrors(form, {});
  }

  function resetForm({ keepTarget = true } = {}) {
    selectedId = null;
    form.reset();
    clearErrors();
    if (mode === 'card-prices') {
      form.card_id.value = keepTarget && selectedTargetId ? selectedTargetId : '';
      form.recorded_at.value = localToday();
      form.source.value = 'admin';
      setEditor(false, '새 카드 시세');
    } else if (mode === 'box-prices') {
      form.set_id.value = keepTarget && selectedTargetId ? selectedTargetId : '';
      form.recorded_at.value = localToday();
      form.source.value = 'admin';
      setEditor(false, '새 박스 시세');
    } else if (mode === 'sets') {
      setEditor(false, '새 세트');
    } else {
      setEditor(false, '새 카드');
    }
    for (const node of list.querySelectorAll('.admin-record')) node.classList.remove('is-selected');
  }

  function selectRecord(id, button) {
    selectedId = Number(id);
    for (const node of list.querySelectorAll('.admin-record')) node.classList.toggle('is-selected', node === button);
  }

  function recordButton({ id, title, meta, aside, onClick, badges = [] }) {
    const main = el('span', { class:'admin-record__main' }, [
      el('span', { class:'admin-record__title' }, [title, ...badges]),
      el('span', { class:'admin-record__meta' }, meta || ''),
    ]);
    return el('button', {
      type:'button', class:'admin-record', onClick,
    }, [main, el('span', { class:'admin-record__aside' }, aside || '-')]);
  }

  async function loadSets() {
    const data = await api('/api/sets');
    sets = data.sets;
    return sets;
  }

  async function loadCards({ q = '', set = '' } = {}) {
    const params = new URLSearchParams({ size:'100' });
    if (q) params.set('q', q);
    if (set) params.set('set', set);
    const data = await api('/api/cards?' + params.toString());
    cards = data.cards;
    return data;
  }

  function fillSetOptions(select, { includeAll = false } = {}) {
    replaceChildren(select, [
      el('option', { value:'' }, includeAll ? '전체 세트' : '세트 선택'),
      ...sets.map((set) => el('option', { value:set.id }, set.name)),
    ]);
  }

  async function initSetsPage() {
    const search = document.getElementById('list-search');
    await loadSets();

    const render = () => {
      const keyword = search.value.trim().toLowerCase();
      const filtered = sets.filter((set) => !keyword || set.name.toLowerCase().includes(keyword));
      resultCount.textContent = filtered.length + ' SETS';
      replaceChildren(list, filtered.length
        ? filtered.map((set) => recordButton({
            id:set.id,
            title:set.name,
            meta:(set.release_date ? formatDate(set.release_date) : '발매일 미등록') + ' · 카드 ' + set.card_count + '장',
            aside:formatPrice(set.current_box_price),
            onClick:(event) => editSet(set, event.currentTarget),
          }))
        : el('div', { class:'empty-state' }, '조건에 맞는 세트가 없습니다.'));
    };

    function editSet(set, button) {
      selectRecord(set.id, button);
      form.id.value = set.id;
      form.name.value = set.name || '';
      form.release_date.value = set.release_date || '';
      form.box_price.value = set.box_price ?? '';
      form.packs_per_box.value = set.packs_per_box ?? '';
      form.external_id.value = set.external_id || '';
      form.image_url.value = set.image_url || '';
      setEditor(true, '세트 수정');
      clearErrors();
    }

    search.addEventListener('input', render);
    render();
  }

  async function initCardsPage() {
    const search = document.getElementById('list-search');
    const setFilter = document.getElementById('list-set-filter');
    await loadSets();
    fillSetOptions(setFilter, { includeAll:true });
    fillSetOptions(form.set_id);

    async function render() {
      try {
        const data = await loadCards({ q:search.value.trim(), set:setFilter.value });
        resultCount.textContent = data.total + ' CARDS';
        replaceChildren(list, data.cards.length
          ? data.cards.map((card) => recordButton({
              id:card.id,
              title:card.name,
              meta:(card.card_number || '번호 없음') + ' · ' + card.set_name,
              aside:card.rarity || '-',
              onClick:(event) => editCard(card, event.currentTarget),
            }))
          : el('div', { class:'empty-state' }, '조건에 맞는 카드가 없습니다.'));
      } catch (err) {
        handleError(err);
      }
    }

    function editCard(card, button) {
      selectRecord(card.id, button);
      form.id.value = card.id;
      form.set_id.value = card.set_id;
      form.name.value = card.name || '';
      form.card_number.value = card.card_number || '';
      form.rarity.value = card.rarity || '';
      form.external_id.value = card.external_id || '';
      form.image_url.value = card.image_url || '';
      setEditor(true, '카드 수정');
      clearErrors();
    }

    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 180);
    });
    setFilter.addEventListener('change', render);
    await render();
  }

  function setPayload() {
    return {
      name:form.name.value.trim(),
      release_date:form.release_date.value || null,
      box_price:numberOrNull(form.box_price.value),
      packs_per_box:numberOrNull(form.packs_per_box.value),
      image_url:form.image_url.value.trim() || null,
      external_id:form.external_id.value.trim() || null,
    };
  }

  function cardPayload() {
    return {
      set_id:Number(form.set_id.value),
      name:form.name.value.trim(),
      card_number:form.card_number.value.trim() || null,
      rarity:form.rarity.value.trim() || null,
      image_url:form.image_url.value.trim() || null,
      external_id:form.external_id.value.trim() || null,
    };
  }

  async function submitEntity() {
    clearErrors();
    const editing = Boolean(selectedId);
    const path = mode === 'sets'
      ? '/api/admin/sets' + (editing ? '/' + selectedId : '')
      : '/api/admin/cards' + (editing ? '/' + selectedId : '');
    const payload = mode === 'sets' ? setPayload() : cardPayload();

    try {
      await api(path, { method:editing ? 'PUT' : 'POST', body:payload });
      toast(editing ? '수정했습니다.' : '등록했습니다.', 'success');
      resetForm();
      if (mode === 'sets') await initSetsPageRefresh();
      else await refreshCardsPage();
    } catch (err) {
      if (err.fields) showFieldErrors(form, err.fields);
      handleError(err);
    }
  }

  async function initSetsPageRefresh() {
    sets = await loadSets();
    const search = document.getElementById('list-search');
    const keyword = search.value.trim().toLowerCase();
    const filtered = sets.filter((set) => !keyword || set.name.toLowerCase().includes(keyword));
    resultCount.textContent = filtered.length + ' SETS';
    replaceChildren(list, filtered.length
      ? filtered.map((set) => recordButton({
          id:set.id, title:set.name,
          meta:(set.release_date ? formatDate(set.release_date) : '발매일 미등록') + ' · 카드 ' + set.card_count + '장',
          aside:formatPrice(set.current_box_price),
          onClick:(event) => {
            selectRecord(set.id, event.currentTarget);
            form.id.value=set.id; form.name.value=set.name||''; form.release_date.value=set.release_date||'';
            form.box_price.value=set.box_price??''; form.packs_per_box.value=set.packs_per_box??'';
            form.external_id.value=set.external_id||''; form.image_url.value=set.image_url||'';
            setEditor(true,'세트 수정'); clearErrors();
          },
        }))
      : el('div',{class:'empty-state'},'조건에 맞는 세트가 없습니다.'));
  }

  async function refreshCardsPage() {
    sets = await loadSets();
    const formSet = form.set_id;
    const selectedSet = formSet.value;
    fillSetOptions(formSet);
    formSet.value = selectedSet;
    const search = document.getElementById('list-search');
    const setFilter = document.getElementById('list-set-filter');
    const data = await loadCards({ q:search.value.trim(), set:setFilter.value });
    resultCount.textContent = data.total + ' CARDS';
    replaceChildren(list, data.cards.length
      ? data.cards.map((card) => recordButton({
          id:card.id, title:card.name,
          meta:(card.card_number||'번호 없음')+' · '+card.set_name,
          aside:card.rarity||'-',
          onClick:(event) => {
            selectRecord(card.id,event.currentTarget);
            form.id.value=card.id; form.set_id.value=card.set_id; form.name.value=card.name||'';
            form.card_number.value=card.card_number||''; form.rarity.value=card.rarity||'';
            form.external_id.value=card.external_id||''; form.image_url.value=card.image_url||'';
            setEditor(true,'카드 수정'); clearErrors();
          },
        }))
      : el('div',{class:'empty-state'},'조건에 맞는 카드가 없습니다.'));
  }

  async function deleteEntity() {
    if (!selectedId) return;
    const noun = mode === 'sets' ? '세트' : '카드';
    if (!await confirmDialog(noun + '를 삭제할까요? 연결된 데이터에 영향을 줄 수 있습니다.', { danger:true })) return;
    try {
      await api('/api/admin/' + mode + '/' + selectedId, { method:'DELETE' });
      toast(noun + '를 삭제했습니다.', 'success');
      resetForm();
      if (mode === 'sets') await initSetsPageRefresh();
      else await refreshCardsPage();
    } catch (err) {
      handleError(err);
    }
  }

  async function initCardPricesPage() {
    const setSelect = document.getElementById('target-set');
    const search = document.getElementById('target-search');
    const target = document.getElementById('target-id');
    await loadSets();
    fillSetOptions(setSelect, { includeAll:true });

    async function populateCards(preferred) {
      const data = await loadCards({ q:search.value.trim(), set:setSelect.value });
      const old = preferred || target.value;
      replaceChildren(target, [
        el('option',{value:''},'카드를 선택하세요'),
        ...data.cards.map((card)=>el('option',{value:card.id},card.name+' · '+card.set_name+' · '+(card.rarity||'-'))),
      ]);
      if (old && data.cards.some((card)=>String(card.id)===String(old))) target.value=old;
      await selectCardTarget();
    }

    async function selectCardTarget() {
      selectedTargetId = target.value ? Number(target.value) : null;
      form.card_id.value = selectedTargetId || '';
      resetForm();
      if (!selectedTargetId) {
        document.getElementById('target-summary').textContent='-';
        resultCount.textContent='-';
        replaceChildren(list, el('div',{class:'empty-state'},'카드를 선택하세요.'));
        return;
      }
      const card = cards.find((item)=>item.id===selectedTargetId) || (await api('/api/cards/'+selectedTargetId)).card;
      document.getElementById('target-summary').textContent=card.name;
      await loadCardPriceHistory(card);
    }

    async function loadCardPriceHistory(card) {
      const data = await api('/api/cards/'+card.id+'/prices?range=all');
      currentRecords = data.prices;
      resultCount.textContent = currentRecords.length + ' RECORDS';
      replaceChildren(list, currentRecords.length
        ? [...currentRecords].reverse().map((record)=>recordButton({
            id:record.id,
            title:formatPrice(record.price),
            meta:formatDate(record.recorded_at)+' · '+record.source,
            aside:'#'+record.id,
            onClick:(event)=>editCardPrice(record,event.currentTarget),
          }))
        : el('div',{class:'empty-state'},'등록된 시세가 없습니다.'));
    }

    function editCardPrice(record, button) {
      selectRecord(record.id,button);
      form.id.value=record.id;
      form.card_id.value=selectedTargetId;
      form.price.value=record.price;
      form.recorded_at.value=record.recorded_at;
      form.source.value=record.source === 'seed' ? 'admin' : record.source;
      setEditor(true,'카드 시세 수정');
      clearErrors();
    }

    let timer;
    search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>populateCards(),180);});
    setSelect.addEventListener('change',()=>populateCards());
    target.addEventListener('change',selectCardTarget);
    await populateCards(new URLSearchParams(location.search).get('card'));
  }

  async function initBoxPricesPage() {
    const target = document.getElementById('target-id');
    await loadSets();
    replaceChildren(target, [
      el('option',{value:''},'세트를 선택하세요'),
      ...sets.map((set)=>el('option',{value:set.id},set.name)),
    ]);

    async function selectSetTarget() {
      selectedTargetId = target.value ? Number(target.value) : null;
      form.set_id.value = selectedTargetId || '';
      resetForm();
      if (!selectedTargetId) {
        document.getElementById('target-summary').textContent='-';
        resultCount.textContent='-';
        replaceChildren(list,el('div',{class:'empty-state'},'세트를 선택하세요.'));
        return;
      }
      const data = await api('/api/sets/'+selectedTargetId);
      const set = data.set;
      document.getElementById('target-summary').textContent=set.name;
      currentRecords=set.box_prices;
      resultCount.textContent=currentRecords.length+' RECORDS';
      replaceChildren(list,currentRecords.length
        ? [...currentRecords].reverse().map((record)=>recordButton({
            id:record.id,
            title:formatPrice(record.price),
            meta:formatDate(record.recorded_at)+' · '+record.source+(record.seller_name?' · '+record.seller_name:''),
            aside:'#'+record.id,
            onClick:(event)=>editBoxPrice(record,event.currentTarget),
          }))
        : el('div',{class:'empty-state'},'등록된 박스 시세가 없습니다.'));
    }

    function editBoxPrice(record,button) {
      selectRecord(record.id,button);
      form.id.value=record.id; form.set_id.value=selectedTargetId;
      form.price.value=record.price; form.recorded_at.value=record.recorded_at;
      form.source.value=record.source==='seed'?'admin':record.source;
      form.seller_name.value=record.seller_name||''; form.source_url.value=record.source_url||'';
      setEditor(true,'박스 시세 수정'); clearErrors();
    }

    target.addEventListener('change',selectSetTarget);
    const requested = new URLSearchParams(location.search).get('set');
    if (requested && sets.some((set)=>String(set.id)===requested)) target.value=requested;
    await selectSetTarget();
  }

  function pricePayload() {
    const base = {
      price:form.price.value === '' ? null : Number(form.price.value),
      recorded_at:form.recorded_at.value,
      source:form.source.value,
    };
    if (mode === 'card-prices') return { ...base, card_id:Number(form.card_id.value) };
    return {
      ...base,
      set_id:Number(form.set_id.value),
      seller_name:form.seller_name.value.trim() || null,
      source_url:form.source_url.value.trim() || null,
    };
  }

  async function submitPrice() {
    clearErrors();
    const clientErrors = {};
    if (form.price.value === '') clientErrors.price = '가격을 입력해 주세요.';
    if (!form.recorded_at.value) clientErrors.recorded_at = '기록일을 입력해 주세요.';
    if (Object.keys(clientErrors).length) {
      showFieldErrors(form, clientErrors);
      toast('필수 입력값을 확인해 주세요.', 'error');
      return;
    }
    if (!selectedTargetId) {
      toast(mode === 'card-prices' ? '먼저 카드를 선택하세요.' : '먼저 세트를 선택하세요.', 'error');
      return;
    }
    const editing=Boolean(selectedId);
    const endpoint=mode==='card-prices'?'prices':'box-prices';
    try {
      await api('/api/admin/'+endpoint+(editing?'/'+selectedId:''),{
        method:editing?'PUT':'POST',body:pricePayload(),
      });
      toast(editing?'시세를 수정했습니다.':'시세를 등록했습니다.','success');
      resetForm();
      if(mode==='card-prices'){
        const card=(await api('/api/cards/'+selectedTargetId)).card;
        const data=await api('/api/cards/'+selectedTargetId+'/prices?range=all');
        currentRecords=data.prices; resultCount.textContent=currentRecords.length+' RECORDS';
        replaceChildren(list,[...currentRecords].reverse().map((record)=>recordButton({
          id:record.id,title:formatPrice(record.price),meta:formatDate(record.recorded_at)+' · '+record.source,aside:'#'+record.id,
          onClick:(event)=>{selectRecord(record.id,event.currentTarget);form.id.value=record.id;form.card_id.value=selectedTargetId;form.price.value=record.price;form.recorded_at.value=record.recorded_at;form.source.value=record.source==='seed'?'admin':record.source;setEditor(true,'카드 시세 수정');clearErrors();},
        })));
        document.getElementById('target-summary').textContent=card.name;
      }else{
        const data=await api('/api/sets/'+selectedTargetId);
        currentRecords=data.set.box_prices; resultCount.textContent=currentRecords.length+' RECORDS';
        replaceChildren(list,[...currentRecords].reverse().map((record)=>recordButton({
          id:record.id,title:formatPrice(record.price),meta:formatDate(record.recorded_at)+' · '+record.source+(record.seller_name?' · '+record.seller_name:''),aside:'#'+record.id,
          onClick:(event)=>{selectRecord(record.id,event.currentTarget);form.id.value=record.id;form.set_id.value=selectedTargetId;form.price.value=record.price;form.recorded_at.value=record.recorded_at;form.source.value=record.source==='seed'?'admin':record.source;form.seller_name.value=record.seller_name||'';form.source_url.value=record.source_url||'';setEditor(true,'박스 시세 수정');clearErrors();},
        })));
      }
    } catch(err) {
      if(err.fields) showFieldErrors(form,err.fields);
      handleError(err);
    }
  }

  async function deletePrice() {
    if(!selectedId) return;
    if(!await confirmDialog('이 시세 기록을 삭제할까요?',{danger:true})) return;
    const endpoint=mode==='card-prices'?'prices':'box-prices';
    try{
      await api('/api/admin/'+endpoint+'/'+selectedId,{method:'DELETE'});
      toast('시세 기록을 삭제했습니다.','success');
      resetForm();
      if(mode==='card-prices'){
        document.getElementById('target-id').dispatchEvent(new Event('change'));
      }else{
        document.getElementById('target-id').dispatchEvent(new Event('change'));
      }
    }catch(err){handleError(err);}
  }

  form.addEventListener('submit',(event)=>{
    event.preventDefault();
    if(mode==='sets'||mode==='cards') submitEntity();
    else submitPrice();
  });
  newButton?.addEventListener('click',()=>resetForm());
  resetButton?.addEventListener('click',()=>resetForm());
  deleteButton?.addEventListener('click',()=>{
    if(mode==='sets'||mode==='cards') deleteEntity();
    else deletePrice();
  });

  try {
    if (mode === 'sets') await initSetsPage();
    else if (mode === 'cards') await initCardsPage();
    else if (mode === 'card-prices') await initCardPricesPage();
    else if (mode === 'box-prices') await initBoxPricesPage();
  } catch (err) {
    handleError(err);
    replaceChildren(list, el('div',{class:'empty-state'},'데이터를 불러오지 못했습니다.'));
  }
})();