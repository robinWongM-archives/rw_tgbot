<template>
  <div id="app">
    <apexchart type="area" class="chart" width="50%" :options="chartOptions" :series="series"></apexchart>
  </div>
</template>

<script>
import axios from "axios";

export default {
  data: function() {
    return {
      currentChannel: new URLSearchParams(document.location.search).get('channel'),
      chartOptions: {
        chart: {
          type: 'area',
          stacked: false,
          id: 'news-media-chart',
        },
        plotOptions: {
          line: {

          },
        },
        dataLabels: {
          enabled: false,
        },
        stroke: {
          curve: 'stepline',
          width: 2,
        },
        markers: {
          size: 0,
          style: 'hollow',
        },
        fill: {
        },
        xaxis: {
          type: 'datetime',
        }
      },
      series: [{
        name: this.currentChannel,
        data: [],
      }]
    };
  },

  async mounted() {
    const historyData = await axios.get(`https://service.rwong.cc/tg_bot_chart/${this.currentChannel}`);
    if (historyData.status == 200) {
      this.series = [
        {
          name: this.currentChannel,
          data: historyData.data,
        }
      ]
    }
  },
};
</script>


<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
.chart {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

</style>
