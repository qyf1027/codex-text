import { addDays, isWeekend, format, parseISO, differenceInBusinessDays } from 'date-fns';

export type TaskFlowType = '串行' | '并行';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

export interface ProjectState {
  projectName: string;
  projectStart: string;
  targetGA: string;
  tasks: ScheduledTask[];
}

export interface IPDNode {
  phase: string;
  name: string;
  dependencies: string[];
  flowType: TaskFlowType;
  standardDuration: number; // 用户可自定义的预估耗时
  limitDuration: number;    // 极限压缩耗时
}

export type TaskStatus = '未开始' | '进行中' | '已完成' | '延期';

export interface ScheduledTask extends IPDNode {
  id: string;
  startDate: string;         // AI 预测开始
  endDate: string;           // AI 预测结束
  actualStartDate?: string;  // 实际开始时间 (用户填)
  actualEndDate?: string;    // 实际完成时间 (自动填)
  status: TaskStatus;
  isCritical: boolean;
  currentDuration: number;   // 实际耗时/当前耗时
  isCompressed: boolean;
  delayDays?: number;        // 延期天数
  remark?: string;           // 备注
}

export const IPD_DATABASE: IPDNode[] = [
  // Charter 阶段
  { phase: 'charter', name: '战略评级', dependencies: [], flowType: '串行', standardDuration: 5, limitDuration: 3 },
  { phase: 'charter', name: '市场评估', dependencies: ['战略评级'], flowType: '串行', standardDuration: 7, limitDuration: 5 },
  { phase: 'charter', name: 'VOC分析', dependencies: ['市场评估'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'charter', name: 'PSD选择及分析', dependencies: ['市场评估'], flowType: '串行', standardDuration: 5, limitDuration: 3 },
  { phase: 'charter', name: '利基市场选择', dependencies: ['PSD选择及分析'], flowType: '串行', standardDuration: 3, limitDuration: 2 },
  { phase: 'charter', name: '竞品分析', dependencies: ['利基市场选择'], flowType: '并行', standardDuration: 7, limitDuration: 4 },
  
  // TR1 阶段
  { phase: 'TR1', name: '创建开发项目', dependencies: ['竞品分析'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'TR1', name: '产品定义', dependencies: ['创建开发项目'], flowType: '串行', standardDuration: 10, limitDuration: 7 },
  { phase: 'TR1', name: '资源开发', dependencies: ['产品定义'], flowType: '并行', standardDuration: 15, limitDuration: 10 },
  { phase: 'TR1', name: '技术路标', dependencies: ['产品定义'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR1', name: 'CFMEA', dependencies: ['产品定义'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR1', name: '产品路标', dependencies: ['产品定义'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR1', name: '工程可行性分析', dependencies: ['产品定义'], flowType: '串行', standardDuration: 10, limitDuration: 7 },
  { phase: 'TR1', name: '选样alpha测试', dependencies: ['工程可行性分析'], flowType: '并行', standardDuration: 14, limitDuration: 10 },
  { phase: 'TR1', name: '厂家签约意向沟通', dependencies: ['工程可行性分析'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR1', name: '产品简介会', dependencies: ['工程可行性分析'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'CDCP', name: '线下TR1评审', dependencies: ['产品简介会'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  { phase: 'TR1', name: '利基市场评审', dependencies: ['线下TR1评审'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'TR1', name: '资源匹配确认', dependencies: ['利基市场评审'], flowType: '并行', standardDuration: 3, limitDuration: 2 },
  { phase: 'TR1', name: '商业测算', dependencies: ['利基市场评审'], flowType: '串行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR1', name: '云图TR1评审归档', dependencies: ['商业测算'], flowType: '串行', standardDuration: 1, limitDuration: 1 },

  // TR2 阶段
  { phase: 'TR2', name: 'POC验证', dependencies: ['云图TR1评审归档'], flowType: '串行', standardDuration: 20, limitDuration: 14 },
  { phase: 'TR2', name: '创建SKU/POA', dependencies: ['POC验证'], flowType: '并行', standardDuration: 3, limitDuration: 2 },
  { phase: 'TR2', name: 'TR2云图归档', dependencies: ['POC验证'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  { phase: 'TR2', name: '审厂、供应商入驻', dependencies: ['POC验证'], flowType: '并行', standardDuration: 15, limitDuration: 10 },
  { phase: 'TR2', name: '认证评估', dependencies: ['POC验证'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR2', name: '侵权评估', dependencies: ['POC验证'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR2', name: '合规评估', dependencies: ['POC验证'], flowType: '并行', standardDuration: 5, limitDuration: 3 },

  // TR3 阶段
  { phase: 'TR3', name: '产品PRD', dependencies: ['TR2云图归档'], flowType: '串行', standardDuration: 10, limitDuration: 7 },
  { phase: 'TR3', name: 'DFMEA评估', dependencies: ['产品PRD'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR3', name: 'TR3云图归档', dependencies: ['产品PRD'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  { phase: 'TR3', name: 'ID&结构设计', dependencies: ['TR3云图归档'], flowType: '串行', standardDuration: 20, limitDuration: 15 },
  { phase: 'TR3', name: 'IE成本分析', dependencies: ['ID&结构设计'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR3', name: 'PRD技术评审会议', dependencies: ['ID&结构设计'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'TR3', name: '认证审核/计划', dependencies: ['PRD技术评审会议'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR3', name: '平台店铺/品牌合规评审', dependencies: ['PRD技术评审会议'], flowType: '并行', standardDuration: 5, limitDuration: 3 },

  // TR4 阶段
  { phase: 'TR4', name: '测试前，供应商预审', dependencies: ['PRD技术评审会议'], flowType: '串行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR4', name: '功能测试，可靠性测试', dependencies: ['测试前，供应商预审'], flowType: '串行', standardDuration: 30, limitDuration: 20 },
  { phase: 'TR4', name: '产研侧TR4准出评审会议', dependencies: ['功能测试，可靠性测试'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'TR4', name: 'TR4云图归档', dependencies: ['产研侧TR4准出评审会议'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  { phase: 'TR4', name: '表面设计', dependencies: ['TR4云图归档'], flowType: '并行', standardDuration: 10, limitDuration: 7 },
  { phase: 'TR4', name: '说明书、包装设计', dependencies: ['TR4云图归档'], flowType: '并行', standardDuration: 15, limitDuration: 10 },
  { phase: 'TR4', name: '产品发布会（MR1&MR2）', dependencies: ['TR4云图归档'], flowType: '并行', standardDuration: 5, limitDuration: 3 },
  { phase: 'TR4', name: '销售、备货计划制定', dependencies: ['TR4云图归档'], flowType: '并行', standardDuration: 7, limitDuration: 5 },
  { phase: 'TR4', name: '财务评审销售/备货计划', dependencies: ['销售、备货计划制定'], flowType: '并行', standardDuration: 3, limitDuration: 2 },
  { phase: 'PDCP', name: 'PDCP评审', dependencies: ['财务评审销售/备货计划'], flowType: '串行', standardDuration: 2, limitDuration: 1 },

  // TR4A 阶段
  { phase: 'TR4A', name: 'BETA 测试', dependencies: ['PDCP评审'], flowType: '串行', standardDuration: 14, limitDuration: 10 },
  { phase: 'TR4A', name: '包装，说明书正确性审核', dependencies: ['BETA 测试'], flowType: '并行', standardDuration: 3, limitDuration: 2 },
  { phase: 'TR4A', name: '下单', dependencies: ['BETA 测试'], flowType: '串行', standardDuration: 2, limitDuration: 1 },
  { phase: 'TR4A', name: '认证实施', dependencies: ['下单'], flowType: '并行', standardDuration: 30, limitDuration: 20 },

  // TR5 阶段
  { phase: 'TR5', name: '产前样签样', dependencies: ['下单'], flowType: '串行', standardDuration: 7, limitDuration: 5 },
  { phase: 'TR5', name: '试产准备、验收', dependencies: ['产前样签样'], flowType: '串行', standardDuration: 10, limitDuration: 7 },

  // EDCP 阶段
  { phase: 'EDCP', name: '发起调拨、运输', dependencies: ['试产准备、验收'], flowType: '串行', standardDuration: 30, limitDuration: 15 },
  { phase: 'EDCP', name: 'EDCP评审', dependencies: ['发起调拨、运输'], flowType: '串行', standardDuration: 2, limitDuration: 1 },

  // GA 阶段
  { phase: 'GA', name: '上架开售', dependencies: ['EDCP评审'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
];

export function addBusinessDays(startDate: Date, days: number): Date {
  let count = 0;
  let current = new Date(startDate);
  while (count < days) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      count++;
    }
  }
  return current;
}

export function calculateEndDate(startDate: string, duration: number): string {
  const start = parseISO(startDate);
  const end = addBusinessDays(start, duration);
  return format(end, 'yyyy-MM-dd');
}

export function getBusinessDaysCount(startDate: string, endDate: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  // differenceInBusinessDays returns 0 if same day, so we add 1 to be inclusive
  return Math.abs(differenceInBusinessDays(end, start)) + 1;
}
