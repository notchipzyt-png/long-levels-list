import { fetchPacks } from '../content.js';

import Spinner from '../components/Spinner.js';

export default {
    components: {
        Spinner,
    },
    data: () => ({
        packs: [],
        loading: true,
        selected: 0,
    }),
    template: `
        <main v-if="loading">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-packs-container">
            <div class="page-packs">
                <div class="board-container">
                    <div class="packs-list">
                        <div v-for="(pack, i) in packs" :key="pack.id" class="pack-item" :class="{ 'active': selected == i }" @click="selected = i">
                            <h3 class="type-label-lg">{{ pack.title }}</h3>
                            <p class="description">{{ pack.description }}</p>
                        </div>
                    </div>
                </div>
                <div class="player-container">
                    <div class="pack-details">
                        <h1>{{ selected_pack.title }}</h1>
                        <p class="description">{{ selected_pack.description }}</p>
                        <h2>Reward: <span class="points">{{ selected_pack.pointsReward }} Points</span></h2>
                        <h2>Levels ({{ selected_pack.levels ? selected_pack.levels.length : 0 }})</h2>
                        <table class="table" v-if="selected_pack.levels && selected_pack.levels.length > 0">
                            <tr v-for="level in selected_pack.levels" :key="level.id">
                                <td class="level">
                                    <p class="type-label-lg">{{ level.title }}</p>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    `,
    computed: {
        selected_pack() {
            return this.packs[this.selected] || { levels: [] };
        },
    },
    async mounted() {
        const packs = await fetchPacks();
        this.packs = packs;
        this.loading = false;
    },
};
