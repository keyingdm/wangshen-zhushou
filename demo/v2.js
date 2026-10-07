(async function () {
  const L = ApplicationLibrary, S = ApplicationSchema;
  if (!localStorage.getItem('application-demo:library')) await ApplicationStorage.set('library', L.emptyLibrary());
  const host = document.createElement('div'); host.setAttribute('data-application-helper', 'true');
  Object.assign(host.style, { position: 'fixed', right: '0', top: '0', width: '374px', height: '100vh', zIndex: '10000' });
  const frame = document.createElement('iframe'); frame.src = '../extension/panel.html'; frame.title = '网申助手新版面板'; frame.allow = 'clipboard-write'; Object.assign(frame.style, { width: '100%', height: '100%', border: '0', boxShadow: '-4px 0 25px #11352a1a' });
  const button = document.createElement('button'); button.textContent = '收起助手'; Object.assign(button.style, { position: 'absolute', left: '-35px', top: '100px', width: '35px', writingMode: 'vertical-rl', padding: '13px 8px', color: 'white', background: '#126e65' });
  button.onclick = () => { const folded = host.style.width !== '0px'; host.style.width = folded ? '0px' : '374px'; frame.hidden = folded; button.textContent = folded ? '打开助手' : '收起助手'; document.body.style.paddingRight = folded ? '25px' : '400px'; };
  function bridge() { frame.contentWindow.ApplicationDemoBridge = (action, payload) => action === 'scan' ? ApplicationAgent.scan(document.getElementById('form')) : ApplicationAgent[action](payload); }
  frame.addEventListener('load', bridge); host.append(frame, button); document.body.append(host);
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { document.querySelectorAll('#form>fieldset').forEach(f => { f.hidden = f.id !== b.dataset.section; }); document.querySelectorAll('#nav button').forEach(n => n.classList.toggle('active', n === b)); });
  document.getElementById('sample').onclick = async () => {
    const library = L.emptyLibrary(), p = L.active(library).profile;
    L.active(library).name = '虚构示例 · 开发岗位';
    Object.assign(p.basic, { name: '示例同学', phone: '13800000000', email: 'demo@example.com', gender: '男', birthday: '2003-01-02', hometownProvince: '演示省A', hometownCity: '演示市A', householdProvince: '演示省A', householdCity: '演示市A', originProvince: '演示省A', originCity: '演示市A', language1: '英语', languageLevel1: '英语四级' });
    p.education = [{ ...S.blankRecord('education'), school: '示例工程大学', major: '电子工程（演示）', qualification: '本科', start: '2023-09', end: '2027-06', mode: '全日制', degree: '示例学位', rank: '演示排名' }];
    p.projects = [{ ...S.blankRecord('projects'), name: '环境数据采集演示项目', role: '开发成员', start: '2024-03', end: '2024-12', description: '基于控制器与传感器采集环境数据，在显示界面中展示变化。', responsibilities: '编写传感器驱动与通信程序，完成采集模块调试。', results: '完成数据采集和显示演示。' }];
    p.text.selfEvaluation = '认真整理需求、记录测试结果，并按计划推进开发任务。'; p.text.hobbies = '阅读技术资料、制作电子实验。';
    await L.save(library); // Demo-only, explicit button; never preloads the production extension.
  };
  document.getElementById('empty').onclick = async () => { if (confirm('清空本机演示资料？已安装插件的资料不受影响。')) await L.save(L.emptyLibrary()); };
  document.getElementById('form').onsubmit = event => event.preventDefault();
})();
