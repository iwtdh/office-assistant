import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	Notice,
	PluginSettingTab,
	Setting,
	TFile,
	Modal,
	TextAreaComponent,
	ButtonComponent
} from 'obsidian';

// ========== 全局配置 ==========
const DEFAULT_LMSTUDIO_BASE = "http://127.0.0.1:1234/v1";
const DEFAULT_MODEL_NAME = "qwen3.5-9b";
const DEFAULT_TEMP = 0.15;
const DEFAULT_TOP_P = 0.3;
const DEFAULT_MAX_TOKENS = 4000;
// ================================================================

// LLM 提供商类型
type LLMProvider = 'lmstudio' | 'openai' | 'azure' | 'custom';

// 任务指令集
interface TaskItem {
	id: string;
	label: string;
	systemPrompt: string;
	icon?: string;
}

const DEFAULT_TASK_LIST: TaskItem[] = [
	{
		id: "summary",
		label: "📝 文本摘要",
		systemPrompt: `你是办公助手。任务：对输入文本提炼摘要，输出Markdown要点列表。
要求：忠于原文，不编造信息；精简、客观；不要多余开场白。`
	},
	{
		id: "polish",
		label: "📄 公文润色",
		systemPrompt: `你是公文写作助手。任务：将文本改写为规范正式书面语，逻辑通顺，适合工作汇报、方案、通知。
要求：不改变原意，去除口语化表达；输出干净文本，无多余闲聊。`
	},
	{
		id: "minutes",
		label: "📌 提取会议纪要",
		systemPrompt: `你是会议整理助手。任务：从会议记录中提取：会议议题、达成决议、待办事项、责任人/时间（如有），用Markdown列表输出。
不编造内容，原文没有的信息不补充。`
	},
	{
		id: "email",
		label: "✉️ 改写正式邮件",
		systemPrompt: `你是办公邮件助手。任务：把原文改写为正式工作邮件正文，语气得体简洁。只输出邮件正文，不要标题。`
	},
	{
		id: "compress",
		label: "✂️ 文本精简压缩",
		systemPrompt: `你是文本压缩助手。任务：压缩文字篇幅，保留全部核心信息，去除冗余重复，尽量精简。不要新增信息。`
	},
	{
		id: "classical",
		label: "📜 文言文转白话",
		systemPrompt: `你是专业古籍翻译。任务：文言文翻译成标准现代汉语白话译文
1. 忠于原文，不增义、不减义、不脑补背景故事，禁止赏析评价；
2. 优先直译，倒装、省略、古今异义调整为现代汉语语序；
3. 人名、地名、官职名保留原文，不强行意译；
4. 生僻实词、多义词优先选用本句语境释义；
5. 禁止输出任何思考推理内容，直接输出白话译文。`
	},
	{
		id: "brainstorm",
		label: "💡 头脑风暴生成备选方案",
		systemPrompt: `你是方案策划助手。任务：基于用户原文，生成3~5条可行备选方案，Markdown列表。只输出方案，不加多余闲聊。`
	},
	{
		id: "quotation",
		label: "🏗️ 工程施工报价",
		systemPrompt: `你是资深造价工程师。任务：根据输入的工程项目信息（工程量清单、项目特征、材料规格、施工工艺等），输出专业的工程施工报价分析。

【输出格式要求】：
## 📋 工程报价分析报告

### 1. 项目概况
- 项目名称：
- 建设规模/工程量：
- 结构形式/施工工艺：
- 所在地区/价格基期：

### 2. 单价分析表
| 序号 | 项目名称 | 单位 | 数量 | 综合单价(元) | 合价(元) | 备注 |
|------|----------|------|------|--------------|----------|------|
| 1 |  |  |  |  |  |  |  |

### 3. 造价构成分析
- **人工费**：占比 XX%，含工种、工日单价
- **材料费**：占比 XX%，主材品牌/规格、含税单价
- **机械费**：占比 XX%，台班单价、进出场费
- **管理费**：按 XX% 计取
- **利润**：按 XX% 计取
- **税金**：按 XX% 计取

### 4. 关键风险提示
- 材料价格波动风险：
- 设计变更风险：
- 工期赶工成本：
- 隐蔽工程不确定性：

### 5. 降本建议
- 材料替代方案：
- 工艺优化建议：
- 机械配置调整：

【计算规则】：
1. 严格按《建设工程工程量清单计价规范》GB 50500-2013 及各地计价依据
2. 综合单价 = 人工 + 材料 + 机械 + 管理费 + 利润 + 规费 + 税金
3. 无法确定的量价信息标注"需现场核实"或"按当地定额套用"
4. 禁止编造具体单价，未知价格标注"参考价"并注明来源
5. **禁止输出思考推理过程，不要输出思考块，直接输出报价结果**
6. **禁止输出任何 \`think\`/\`回答\`/\`thinking\` 标签及其内容**
7. **直接输出最终 Markdown 报价单，无需解释计算过程**`
	},
	{
		id: "data-normalize",
		label: "📊 数据规范整理",
		systemPrompt: `你是数据治理专家。任务：将非结构化/半结构化文本转换为规范的结构化数据（Markdown 表格 / JSON / CSV）。

【核心能力】：
1. **脏数据清洗**：去除多余空白、不可见字符、乱码、重复行
2. **字段标准化**：统一日期格式(YYYY-MM-DD)、金额(保留2位小数)、枚举值(如性别: 男/女)、电话/邮箱格式
3. **实体识别抽取**：从文本中识别人名、地名、机构名、金额、日期、编号等
4. **异常值标记**：超出合理范围的数值、缺失必填字段、格式不符项标记 ⚠️
5. **多源融合**：合并同一实体的多条记录，去重补全

【输出格式】：
## 📊 数据规范化报告

### 1. 原始数据概览
- 记录条数：X
- 字段数：Y
- 缺失率：Z%
- 异常记录：N 条

### 2. 清洗规则说明
| 字段 | 原始格式 | 目标格式 | 处理逻辑 | 异常处理 |
|------|----------|----------|----------|----------|
| 日期 | 2024/1/5 | 2024-01-05 | 统一分隔符、补零 | 无法解析标记 ⚠️ |

### 3. 规范化数据表（Markdown）
| 字段1 | 字段2 | 字段3 | ... |
|-------|-------|-------|-----|
| 值1 | 值2 | 值3 | ... |

### 4. 异常记录明细
| 行号 | 原始内容 | 问题描述 | 建议修正 |
|------|----------|----------|----------|

### 5. 导出选项
- Markdown 表格（已在上方）
- JSON 数组：\`\`\`json ... \`\`\`
- CSV 文本：\`\`\`csv ... \`\`\`

【处理原则】：
- 不编造数据，无法确定的字段留空或标注"未知"
- 保留原始行号便于追溯
- 输出完整数据，不截断
- 禁止输出思考过程，直接输出结果`
	},
	{
		id: "table-to-chart",
		label: "📈 表格生成统计图",
		systemPrompt: `你是数据可视化分析师。任务：根据输入的 Markdown 表格数据，生成 ECharts / Mermaid / Chart.js 可直接渲染的图表配置代码，并给出解读建议。

【支持图表类型】：
- **柱状图/条形图**：分类对比、排名
- **折线图/面积图**：趋势变化、时间序列
- **饼图/环形图**：占比结构、构成分析
- **散点图/气泡图**：相关性、分布、三维数据
- **雷达图**：多维指标对比
- **仪表盘/进度条**：KPI 完成度
- **混合图**：双轴组合（柱+线）
- **词云**：关键词频次

【输出格式】：
## 📈 数据可视化图表生成

### 1. 数据概览
- 数据行数：X
- 数值列：Y 个
- 分类列：Z 个
- 时间跨度：如适用

### 2. 推荐图表方案（按优先级）
| 推荐序号 | 图表类型 | 适用理由 | X轴 | Y轴 | 分组/系列 |
|----------|----------|----------|-----|-----|-----------|
| 1 | 柱状图 | 适合分类对比 | 产品名 | 销售额 | 区域 |
| 2 | 折线图 | 适合趋势分析 | 月份 | 销售额 | 产品线 |

### 3. ECharts 配置代码（可直接在 Obsidian ECharts 插件渲染）
\`\`\`javascript
// ECharts Option 对象
option = {
  title: { text: '图表标题', subtext: '副标题' },
  tooltip: { trigger: 'axis' },
  legend: { data: ['系列1', '系列2'] },
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [
    { name: '系列1', type: 'bar', data: [10, 20, 30] },
    { name: '系列2', type: 'line', data: [15, 25, 35] }
  ]
};
\`\`\`

### 4. Mermaid 图表代码（原生渲染，无需插件）
\`\`\`mermaid
%% 示例：柱状图
bar
    title 销售额对比
    xAxis 产品A, 产品B, 产品C
    yAxis 销售额(万元)
    series 产品A, 120
    series 产品B, 200
    series 产品C, 150
\`\`\`

### 5. Chart.js 配置（HTML 嵌入用）
\`\`\`javascript
const config = {
  type: 'bar',
  data: { labels: ['A','B','C'], datasets: [{ label: '销售额', data: [10,20,30] }] },
  options: { responsive: true, plugins: { title: { display: true, text: '图表标题' } } }
};
\`\`\`

### 6. 解读建议
- **核心洞察**：...
- **异常点**：...
- **趋势判断**：...
- **决策建议**：...

【生成原则】：
- 自动推断最适合的图表类型（优先推荐 2-3 种）
- 数据映射准确：分类列→X轴/图例，数值列→Y轴
- 含单位、含标题、含图例
- 大数据量(>50点)建议用折线/散点，小数据量适合柱/饼
- 时间序列必须用折线/面积图，X轴按时间排序
- 禁止输出思考过程，直接输出图表代码和解读`
	}
];

// 插件设置接口
interface LmStudioOfficeSettings {
	// 提供商选择
	llmProvider: LLMProvider;
	
	// LM Studio 本地配置
	lmstudioBase: string;
	lmstudioModel: string;
	
	// 在线 API 配置
	onlineApiBase: string;      // 如 https://api.openai.com/v1
	onlineApiKey: string;       // API Key
	onlineModel: string;        // 如 gpt-4o, claude-3.5-sonnet, deepseek-chat
	
	// 通用生成参数
	temperature: number;
	topP: number;
	maxTokens: number;
	outputMode: 'append' | 'replace' | 'sidebar';
	enableStreaming: boolean;
	customTasks: TaskItem[];
}

const DEFAULT_SETTINGS: LmStudioOfficeSettings = {
	llmProvider: 'lmstudio',
	lmstudioBase: DEFAULT_LMSTUDIO_BASE,
	lmstudioModel: DEFAULT_MODEL_NAME,
	onlineApiBase: 'https://api.openai.com/v1',
	onlineApiKey: '',
	onlineModel: 'gpt-4o-mini',
	temperature: DEFAULT_TEMP,
	topP: DEFAULT_TOP_P,
	maxTokens: DEFAULT_MAX_TOKENS,
	outputMode: 'append',
	enableStreaming: false,
	customTasks: []
};

// 设置面板
class LmStudioOfficeSettingTab extends PluginSettingTab {
	plugin: LmStudioOfficePlugin;

	constructor(app: App, plugin: LmStudioOfficePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'LM Studio 本地办公助手 设置' });

		// 提供商选择
		containerEl.createEl('h3', { text: '🤖 LLM 提供商选择' });
		
		new Setting(containerEl)
			.setName('当前使用的 LLM 服务')
			.setDesc('选择本地 LM Studio 或在线 API 服务')
			.addDropdown(dropdown => dropdown
				.addOption('lmstudio', '🏠 LM Studio 本地 (默认，免费、隐私、离线)')
				.addOption('openai', '☁️ OpenAI / 兼容 API (需 API Key)')
				.addOption('azure', '☁️ Azure OpenAI')
				.addOption('custom', '🔧 自定义 OpenAI 兼容端点')
				.setValue(this.plugin.settings.llmProvider)
				.onChange(async (value) => {
					this.plugin.settings.llmProvider = value as LLMProvider;
					await this.plugin.saveSettings();
					this.display(); // 切换提供商时刷新显示对应配置区
				}));

		// LM Studio 本地配置区
		if (this.plugin.settings.llmProvider === 'lmstudio') {
			containerEl.createEl('h3', { text: '🔗 LM Studio 本地配置' });

			new Setting(containerEl)
				.setName('LM Studio API 地址')
				.setDesc('默认 http://127.0.0.1:1234/v1，确保 LM Studio Local Server 已启动')
				.addText(text => text
					.setPlaceholder(DEFAULT_LMSTUDIO_BASE)
					.setValue(this.plugin.settings.lmstudioBase)
					.onChange(async (value) => {
						this.plugin.settings.lmstudioBase = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('模型名称')
				.setDesc('LM Studio 中加载的模型标识符，如 qwen3.5-9b、qwen2.5-7b 等')
				.addText(text => text
					.setPlaceholder(DEFAULT_MODEL_NAME)
					.setValue(this.plugin.settings.lmstudioModel)
					.onChange(async (value) => {
						this.plugin.settings.lmstudioModel = value;
						await this.plugin.saveSettings();
					}));
		}

		// 在线 API 配置区
		if (this.plugin.settings.llmProvider !== 'lmstudio') {
			containerEl.createEl('h3', { text: '☁️ 在线 API 配置' });

			new Setting(containerEl)
				.setName('API Base URL')
				.setDesc('OpenAI: https://api.openai.com/v1 | Azure: https://{resource}.openai.azure.com/openai/deployments/{deployment} | 其他兼容端点')
				.addText(text => text
					.setPlaceholder('https://api.openai.com/v1')
					.setValue(this.plugin.settings.onlineApiBase)
					.onChange(async (value) => {
						this.plugin.settings.onlineApiBase = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('API Key')
				.setDesc('你的 API 密钥（仅本地保存，不上传）')
				.addText(text => text
					.setPlaceholder('sk-xxx 或 Azure Key')
					.setValue(this.plugin.settings.onlineApiKey)
					.onChange(async (value) => {
						this.plugin.settings.onlineApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('模型名称')
				.setDesc('OpenAI: gpt-4o, gpt-4o-mini, gpt-3.5-turbo | Claude: claude-3.5-sonnet | DeepSeek: deepseek-chat | 其他按提供商文档')
				.addText(text => text
					.setPlaceholder('gpt-4o-mini')
					.setValue(this.plugin.settings.onlineModel)
					.onChange(async (value) => {
						this.plugin.settings.onlineModel = value;
						await this.plugin.saveSettings();
					}));
		}

		// 通用生成参数
		containerEl.createEl('h3', { text: '⚙️ 生成参数' });

		new Setting(containerEl)
			.setName('Temperature (温度)')
			.setDesc('控制随机性，办公场景建议 0.1-0.3，越低越确定')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.05)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Top-P')
			.setDesc('核采样概率阈值，建议 0.3-0.5')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.05)
				.setValue(this.plugin.settings.topP)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.topP = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max Tokens (最大生成长度)')
			.setDesc('单次生成最大 token 数，长文本建议 2000-8000')
			.addText(text => text
				.setPlaceholder(String(DEFAULT_MAX_TOKENS))
				.setValue(String(this.plugin.settings.maxTokens))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.maxTokens = num;
						await this.plugin.saveSettings();
					}
				}));

		// 输出模式
		containerEl.createEl('h3', { text: '📤 输出模式' });

		new Setting(containerEl)
			.setName('结果输出方式')
			.setDesc('选择 AI 结果如何插入笔记')
			.addDropdown(dropdown => dropdown
				.addOption('append', '追加模式：原文保留，结果追加在下方（推荐）')
				.addOption('replace', '替换模式：选中内容被结果替换')
				.addOption('sidebar', '侧边栏模式：在右侧面板显示结果，不修改笔记')
				.setValue(this.plugin.settings.outputMode)
				.onChange(async (value) => {
					this.plugin.settings.outputMode = value as 'append' | 'replace' | 'sidebar';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('启用流式输出')
			.setDesc('逐字渲染 AI 返回内容，长文本更直观（侧边栏模式下生效）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableStreaming)
				.onChange(async (value) => {
					this.plugin.settings.enableStreaming = value;
					await this.plugin.saveSettings();
				}));

		// 自定义任务
		containerEl.createEl('h3', { text: '🛠️ 自定义办公任务' });
		containerEl.createEl('p', { text: '可在此添加、编辑、删除自定义任务', cls: 'setting-item-description' });

		this.renderCustomTasks(containerEl);

		new Setting(containerEl)
			.setName('添加自定义任务')
			.addButton(btn => btn
				.setButtonText('+ 新增任务')
				.setCta()
				.onClick(() => {
					new CustomTaskModal(this.app, (task: TaskItem) => {
						this.plugin.settings.customTasks.push(task);
						this.plugin.saveSettings();
						this.display();
					}).open();
				}));

		// 测试连接
		containerEl.createEl('h3', { text: '🔍 连接测试' });
		new Setting(containerEl)
			.setName('测试当前配置连接')
			.addButton(btn => btn
				.setButtonText('测试连接')
				.onClick(async () => {
					await this.plugin.testConnection();
				}));

		// 重置设置
		containerEl.createEl('h3', { text: '🔄 重置' });
		new Setting(containerEl)
			.setName('恢复默认设置')
			.addButton(btn => btn
				.setButtonText('重置为默认')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings = { ...DEFAULT_SETTINGS };
					await this.plugin.saveSettings();
					this.display();
					new Notice('已恢复默认设置');
				}));
	}

	renderCustomTasks(containerEl: HTMLElement): void {
		const tasks = this.plugin.settings.customTasks;
		if (tasks.length === 0) {
			containerEl.createEl('p', { text: '暂无自定义任务', cls: 'setting-item-description' });
			return;
		}

		tasks.forEach((task, index) => {
			new Setting(containerEl)
				.setName(task.label)
				.setDesc(task.systemPrompt.substring(0, 100) + '...')
				.addButton(btn => btn
					.setButtonText('编辑')
					.onClick(() => {
						new CustomTaskModal(this.app, (updated: TaskItem) => {
							this.plugin.settings.customTasks[index] = updated;
							this.plugin.saveSettings();
							this.display();
						}, task).open();
					}))
				.addButton(btn => btn
					.setButtonText('删除')
					.setWarning()
					.onClick(() => {
						this.plugin.settings.customTasks.splice(index, 1);
						this.plugin.saveSettings();
						this.display();
					}));
		});
	}
}

// 自定义任务编辑弹窗
class CustomTaskModal extends Modal {
	onSubmit: (task: TaskItem) => void;
	editingTask?: TaskItem;

	constructor(app: App, onSubmit: (task: TaskItem) => void, editingTask?: TaskItem) {
		super(app);
		this.onSubmit = onSubmit;
		this.editingTask = editingTask;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.editingTask ? '编辑自定义任务' : '新增自定义任务' });

		let taskId = this.editingTask?.id || `custom-${Date.now()}`;
		let label = this.editingTask?.label || '';
		let systemPrompt = this.editingTask?.systemPrompt || '';

		new Setting(contentEl)
			.setName('任务 ID')
			.setDesc('唯一标识符，仅用于内部识别')
			.addText(text => text
				.setValue(taskId)
				.setDisabled(!!this.editingTask)
				.onChange(v => taskId = v));

		new Setting(contentEl)
			.setName('显示名称')
			.setDesc('菜单中显示的名称，建议带 emoji')
			.addText(text => text
				.setValue(label)
				.onChange(v => label = v));

		new Setting(contentEl)
			.setName('System Prompt')
			.setDesc('发送给模型的系统提示词，定义任务行为')
			.addTextArea(text => {
				text.setValue(systemPrompt)
					.setPlaceholder('例如：你是xxx助手。任务：xxx\n要求：xxx')
					.onChange(v => systemPrompt = v);
				text.inputEl.style.height = '200px';
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
				text.inputEl.style.fontSize = '13px';
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('保存')
				.setCta()
				.onClick(() => {
					if (!label || !systemPrompt) {
						new Notice('请填写完整');
						return;
					}
					this.onSubmit({ id: taskId, label, systemPrompt });
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// 侧边栏结果面板
class SidebarResultView extends Modal {
	private content: string = '';

	constructor(app: App, private title: string, private onCopy: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lmstudio-sidebar-modal');

		const header = contentEl.createEl('div', { cls: 'modal-header' });
		header.createEl('h3', { text: this.title });
		const btnContainer = header.createEl('div', { cls: 'modal-buttons' });
		new ButtonComponent(btnContainer)
			.setButtonText('复制结果')
			.setCta()
			.onClick(() => {
				navigator.clipboard.writeText(this.content);
				new Notice('已复制到剪贴板');
			});
		new ButtonComponent(btnContainer)
			.setButtonText('关闭')
			.onClick(() => this.close());

		this.contentEl.createEl('div', { cls: 'markdown-preview-view', attr: { id: 'lmstudio-result-content' } });
	}

	updateContent(text: string, append: boolean = false): void {
		const container = this.contentEl.querySelector('#lmstudio-result-content');
		if (container) {
			if (append) {
				this.content += text;
			} else {
				this.content = text;
			}
			container.setText(this.content);
			container.scrollTop = container.scrollHeight;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export default class LmStudioOfficePlugin extends Plugin {
	settings: LmStudioOfficeSettings;
	private sidebarView: SidebarResultView | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new LmStudioOfficeSettingTab(this.app, this));

		// 注册编辑器右键菜单
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const selectedText = editor.getSelection();
				if (!selectedText) return;

				menu.addSeparator();
				this.getAllTasks().forEach(task => {
					menu.addItem(item => {
						item.setTitle(`  ${task.label}`)
							.setIcon(task.icon || 'zap')
							.setSection('lmstudio-tasks')
							.onClick(async () => {
								await this.executeTask(editor, selectedText, task);
							});
					});
				});
			})
		);

		// 注册命令面板快捷键
		this.getAllTasks().forEach((task, idx) => {
			this.addCommand({
				id: `lmstudio-office-task-${task.id}`,
				name: `LM Studio AI：${task.label}`,
				editorCallback: async (editor: Editor) => {
					const selectedText = editor.getSelection();
					if (!selectedText) {
						new Notice("⚠️ 请先选中笔记中的文本");
						return;
					}
					await this.executeTask(editor, selectedText, task);
				}
			});
		});

		this.addCommand({
			id: 'lmstudio-test-connection',
			name: 'LM Studio AI：测试连接',
			callback: async () => {
				await this.testConnection();
			}
		});

		this.addCommand({
			id: 'lmstudio-open-sidebar',
			name: 'LM Studio AI：打开结果侧边栏',
			callback: () => {
				this.openSidebar();
			}
		});

		console.log('[LM Studio Office] 插件已加载');
	}

	getAllTasks(): TaskItem[] {
		return [...DEFAULT_TASK_LIST, ...this.settings.customTasks];
	}

	getCurrentModel(): string {
		if (this.settings.llmProvider === 'lmstudio') {
			return this.settings.lmstudioModel;
		}
		return this.settings.onlineModel;
	}

	getCurrentApiBase(): string {
		if (this.settings.llmProvider === 'lmstudio') {
			return this.settings.lmstudioBase;
		}
		return this.settings.onlineApiBase;
	}

	getAuthHeader(): string {
		if (this.settings.llmProvider === 'lmstudio') {
			return 'dummy';
		}
		return `Bearer ${this.settings.onlineApiKey}`;
	}

	// 执行任务主流程
	async executeTask(editor: Editor, selectedText: string, task: TaskItem): Promise<void> {
		const modelName = this.getCurrentModel();
		new Notice(`正在调用 ${modelName}：${task.label}`);

		try {
			let result: string;

			if (this.settings.enableStreaming && this.settings.outputMode === 'sidebar') {
				result = await this.callLmStudioStream(selectedText, task.systemPrompt, task.label);
			} else {
				result = await this.callLmStudio(selectedText, task.systemPrompt);
			}

			await this.handleOutput(editor, selectedText, task.label, result);
			new Notice("✅ 处理完成");

		} catch (err) {
			new Notice(`❌ 调用失败: ${(err as Error).message}`);
			console.error('[LM Studio Office] Error:', err);
		}
	}

	async handleOutput(editor: Editor, originalText: string, taskLabel: string, result: string): Promise<void> {
		const mode = this.settings.outputMode;

		if (mode === 'replace') {
			editor.replaceSelection(result);
		} else if (mode === 'sidebar') {
			this.showInSidebar(taskLabel, result);
		} else {
			const separator = '\n\n---\n';
			const header = `**${taskLabel}结果：**\n`;
			editor.replaceSelection(`${originalText}${separator}${header}${result}`);
		}
	}

	showInSidebar(title: string, content: string): void {
		if (this.sidebarView) {
			this.sidebarView.close();
		}
		this.sidebarView = new SidebarResultView(this.app, title, () => {
			navigator.clipboard.writeText(content);
			new Notice('已复制到剪贴板');
		});
		this.sidebarView.open();
		this.sidebarView.updateContent(content);
	}

	// 非流式调用 - 统一支持 LM Studio 和在线 API
	async callLmStudio(inputText: string, systemPrompt: string): Promise<string> {
		const apiBase = this.getCurrentApiBase();
		const model = this.getCurrentModel();
		const auth = this.getAuthHeader();

		console.log('[LM Studio Office] Calling API:', apiBase, 'model:', model, 'provider:', this.settings.llmProvider);
		console.log('[LM Studio Office] systemPrompt length:', systemPrompt.length, 'inputText length:', inputText.length);

		const resp = await fetch(`${apiBase}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": auth
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: inputText }
				],
				temperature: this.settings.temperature,
				top_p: this.settings.topP,
				max_tokens: this.settings.maxTokens,
				stream: false
			})
		});

		if (!resp.ok) {
			const errText = await resp.text();
			console.error('[LM Studio Office] API Error:', resp.status, errText);
			throw new Error(`API 接口错误 ${resp.status}: ${errText}`);
		}

		const json = await resp.json();
		const content = json.choices?.[0]?.message?.content || "";
		console.log('[LM Studio Office] Response content length:', content.length);
		console.log('[LM Studio Office] Response preview:', content.substring(0, 200));
		return content.trim();
	}

	// 流式调用
	async callLmStudioStream(inputText: string, systemPrompt: string, taskLabel: string): Promise<string> {
		const apiBase = this.getCurrentApiBase();
		const model = this.getCurrentModel();
		const auth = this.getAuthHeader();

		this.showInSidebar(taskLabel, '');

		const resp = await fetch(`${apiBase}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": auth
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: inputText }
				],
				temperature: this.settings.temperature,
				top_p: this.settings.topP,
				max_tokens: this.settings.maxTokens,
				stream: true
			})
		});

		if (!resp.ok || !resp.body) {
			throw new Error(`API 接口错误 ${resp.status}`);
		}

		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') continue;

					try {
						const parsed = JSON.parse(data);
						const delta = parsed.choices?.[0]?.delta?.content;
						if (delta) {
							fullContent += delta;
							this.sidebarView?.updateContent(delta, true);
						}
					} catch {
						// 忽略解析错误
					}
				}
			}
		}

		if (buffer.startsWith('data: ')) {
			const data = buffer.slice(6);
			if (data !== '[DONE]') {
				try {
					const parsed = JSON.parse(data);
					const delta = parsed.choices?.[0]?.delta?.content;
					if (delta) {
						fullContent += delta;
						this.sidebarView?.updateContent(delta, true);
					}
				} catch { }
			}
		}

		return fullContent.trim();
	}

	async testConnection(): Promise<void> {
		new Notice('正在测试连接...');
		try {
			const apiBase = this.getCurrentApiBase();
			const auth = this.getAuthHeader();

			const resp = await fetch(`${apiBase}/models`, {
				method: "GET",
				headers: { "Authorization": auth }
			});

			if (resp.ok) {
				const data = await resp.json();
				const models = data.data?.map((m: any) => m.id).join(', ') || '未知';
				new Notice(`✅ 连接成功！可用模型: ${models}`);
			} else {
				throw new Error(`HTTP ${resp.status}`);
			}
		} catch (err) {
			new Notice(`❌ 连接失败: ${(err as Error).message}`);
			console.error('[LM Studio Office] Connection test failed:', err);
		}
	}

	openSidebar(): void {
		this.showInSidebar('LLM AI 结果', '选择文本并右键调用任务，结果将显示在这里');
	}

	async loadSettings() {
		const loaded = await this.loadData() as any;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// 兼容旧版本配置迁移
		if (!this.settings.llmProvider) {
			this.settings.llmProvider = 'lmstudio';
		}
		if (!this.settings.lmstudioModel && loaded?.modelName) {
			this.settings.lmstudioModel = loaded.modelName;
		}
		if (!this.settings.lmstudioBase && loaded?.lmstudioBase) {
			this.settings.lmstudioBase = loaded.lmstudioBase;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		if (this.sidebarView) {
			this.sidebarView.close();
		}
		console.log('[LM Studio Office] 插件已卸载');
	}
}