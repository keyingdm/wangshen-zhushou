(function () {
  const S = ApplicationSchema;
  const p = S.emptyProfile();
  p.basic = { ...p.basic, name: '示例同学', phone: '13800000000', email: 'demo@example.com', gender: '男', birthday: '2003-01-02', targetCity: '深圳' };
  p.education = [{ ...S.blankRecord('education'), school: '示例理工大学', major: '电子信息科学与技术', qualification: '本科', start: '2023-09', end: '2027-06' }];
  p.projects = [{ ...S.blankRecord('projects'), name: '环境感知智能照明系统（演示）', role: '项目负责人', start: '2024-09', end: '2024-11', description: '基于单片机和环境传感器，实现环境感知与动态调光。', responsibilities: '编写传感器驱动和调光逻辑，完成硬件设计与软硬件联调。', results: '完成传感器采集、动态调光和整机联调，并形成可复用的软件驱动与项目文档。本段故意超过模拟表单的 50 字符限制，用于验证插件会提示精简，保留原文。' }];
  if (!localStorage.getItem('application-demo:profile')) localStorage.setItem('application-demo:profile', JSON.stringify(p));
  const iframe = document.getElementById('assistant');
  // The iframe loads the production popup, with a bridge replacing chrome.scripting only.
  function bridge() { iframe.contentWindow.ApplicationDemoBridge = (action, payload) => action === 'scan' ? ApplicationAgent.scan(document.getElementById('application')) : ApplicationAgent[action](payload); }
  iframe.addEventListener('load', bridge);
  bridge();
  document.getElementById('application').addEventListener('submit', event => {
    event.preventDefault(); document.getElementById('submit-state').textContent = '模拟提交由你点击触发；没有发送网络请求。';
  });
  document.getElementById('reset-demo').addEventListener('click', () => {
    localStorage.setItem('application-demo:profile', JSON.stringify(p)); localStorage.removeItem('application-demo:rules'); location.reload();
  });
})();
