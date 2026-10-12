# 等火箭的完整一天跑完，再补全温室（7dd9393d）和精铸熔炼（d9daaaf1），别和前面的并发打限流
cd /Users/aisandbox/Documents/companydata
while pgrep -f "lab-build-full-day.mts 640f3bc6" >/dev/null; do sleep 30; done
echo "== 温室"; npx tsx scripts/lab-build-full-day.mts 7dd9393d --hint "智慧农业技术员在连栋玻璃温室的完整一天：晨间巡园与环控数据核对、番茄坐果期的温湿光 CO₂ 调控、病虫害识别与处置决策、灌溉施肥配方与 EC/pH 校正、午间高温异常事件处置、采收与分级、日终数据复盘。每一章都要有可操作的虚拟工位（环境传感器、作物图像都是数采点位），带教的是温室技术主管。" 2>&1 | tail -3
echo "== 精铸熔炼"; npx tsx scripts/lab-build-full-day.mts d9daaaf1 --hint "精铸车间熔炼工艺工程师的完整一天：班前交接与炉况检查、配料与炉料核对、真空熔炼升温与精炼、测温取样与成分调整、浇注时机与浇注、脱壳与首检、炉后复盘与工艺记录。每一章都要有可操作的虚拟工位（温度 / 真空度 / 成分都是传感器点位），带教的是熔炼班长。" 2>&1 | tail -3
echo "== 队列完成"
