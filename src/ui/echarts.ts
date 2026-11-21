import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, HeatmapChart, ScatterChart, RadarChart, CustomChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, CalendarComponent, VisualMapComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent, TitleComponent, RadarComponent, DatasetComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import 'echarts-wordcloud';

echarts.use([
  BarChart, LineChart, PieChart, HeatmapChart, ScatterChart, RadarChart, CustomChart, GridComponent, TooltipComponent,
  LegendComponent, CalendarComponent, VisualMapComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent,
  TitleComponent, RadarComponent, DatasetComponent, CanvasRenderer,
]);

export { echarts };
