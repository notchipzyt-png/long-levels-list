import { fetchLeaderboard } from '../content.js';
import { localize } from '../util.js';

import Spinner from '../components/Spinner.js';

export default {
    components: {
        Spinner,
    },
    data: () => ({
        leaderboard: [],
        loading: true,
        selected: 0,
        err: [],
        userProfile: null,
        loadingProfile: false,
    }),
    template: `
        <main v-if="loading">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-leaderboard-container">
            <div class="page-leaderboard">
                <div class="error-container">
                    <p class="error" v-if="err.length > 0">
                        Leaderboard may be incorrect, as the following levels could not be loaded: {{ err.join(', ') }}
                    </p>
                </div>
                <div class="board-container">
                    <table class="board">
                        <tr v-for="(ientry, i) in leaderboard">
                            <td class="rank">
                                <p class="type-label-lg">#{{ i + 1 }}</p>
                            </td>
                            <td class="total">
                                <p class="type-label-lg">{{ localize(ientry.total) }}</p>
                            </td>
                            <td class="user" :class="{ 'active': selected == i }">
                                <button @click="select(i)" class="user-name-btn">
                                    <span class="type-label-lg">{{ ientry.user }}</span>
                                </button>
                            </td>
                        </tr>
                    </table>
                </div>
                <div class="player-container">
                    <div class="player">
                        <h1>#{{ selected + 1 }} {{ entry.user }}</h1>
                        <h3>{{ entry.total }}</h3>

                        <p v-if="loadingProfile" class="type-caption">Loading profile...</p>
                        <p v-else-if="userProfile">Server points: {{ userProfile.points }}</p>

                        <!-- Packs section moved to the top of the profile -->
                        <h2 v-if="(entry.packs && (entry.packs.completed.length > 0 || entry.packs.progressed.length > 0))">
                            Packs
                            <span v-if="entry.packPoints"> — Pack points: <strong>+{{ localize(entry.packPoints) }}</strong></span>
                        </h2>

                        <div v-if="entry.packs && entry.packs.completed.length > 0">
                            <h3>Completed Packs ({{ entry.packs.completed.length }})</h3>
                            <table class="table">
                                <tr v-for="p in entry.packs.completed">
                                    <td class="pack-title"><p class="type-label-lg">{{ p.title }}</p></td>
                                    <td class="pack-points"><p>+{{ localize(p.points) }}</p></td>
                                    <td class="pack-claimed" v-if="userProfile">
                                        <p class="type-caption" v-if="userProfile.claimedPacks && userProfile.claimedPacks.includes(p.id)">Claimed</p>
                                        <p class="type-caption" v-else>Not claimed</p>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <div v-if="entry.packs && entry.packs.progressed.length > 0">
                            <h3>In-progress Packs ({{ entry.packs.progressed.length }})</h3>
                            <table class="table">
                                <tr v-for="p in entry.packs.progressed">
                                    <td class="pack-title">
                                        <p class="type-label-lg">{{ p.title }}</p>
                                        <p class="type-caption">{{ p.completed }}/{{ p.total }} levels ({{ p.percent }}%)</p>
                                    </td>
                                    <td class="pack-points"><p>Potential +{{ localize(p.points) }}</p></td>
                                </tr>
                            </table>
                        </div>

                        <h2 v-if="entry.verified && entry.verified.length > 0">Verified ({{ entry.verified.length}})</h2>
                        <table class="table" v-if="entry.verified && entry.verified.length > 0">
                            <tr v-for="score in entry.verified">
                                <td class="rank"><p>#{{ score.rank }}</p></td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.level }}</a>
                                </td>
                                <td class="score"><p>+{{ localize(score.score) }}</p></td>
                            </tr>
                        </table>

                        <h2 v-if="entry.completed && entry.completed.length > 0">Completed ({{ entry.completed.length }})</h2>
                        <table class="table" v-if="entry.completed && entry.completed.length > 0">
                            <tr v-for="score in entry.completed">
                                <td class="rank"><p>#{{ score.rank }}</p></td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.level }}</a>
                                </td>
                                <td class="score"><p>+{{ localize(score.score) }}</p></td>
                            </tr>
                        </table>

                        <h2 v-if="entry.progressed && entry.progressed.length > 0">Progressed ({{entry.progressed.length}})</h2>
                        <table class="table" v-if="entry.progressed && entry.progressed.length > 0">
                            <tr v-for="score in entry.progressed">
                                <td class="rank"><p>#{{ score.rank }}</p></td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.percent }}% {{ score.level }}</a>
                                </td>
                                <td class="score"><p>+{{ localize(score.score) }}</p></td>
                            </tr>
                        </table>

                        <!-- Show claimed packs from server if available -->
                        <div v-if="userProfile && userProfile.claimedPacks && userProfile.claimedPacks.length > 0">
                            <h3>Profile Claimed Packs (server)</h3>
                            <ul>
                                <li v-for="pid in userProfile.claimedPacks">{{ pid }}</li>
                            </ul>
                        </div>

                    </div>
                </div>
            </div>
        </main>
    `,
    computed: {
        entry() {
            return this.leaderboard[this.selected] || { verified: [], completed: [], progressed: [], packs: { completed: [], progressed: [] }, packPoints: 0 };
        },
    },
    async mounted() {
        const [leaderboard, err] = await fetchLeaderboard();
        this.leaderboard = leaderboard;
        this.err = err;
        this.loading = false;
        // load initial profile for first entry
        this.loadProfile();
    },
    methods: {
        localize,
        select(i) {
            this.selected = i;
            this.loadProfile();
        },
        async loadProfile() {
            this.userProfile = null;
            const ent = this.leaderboard[this.selected];
            if (!ent || !ent.user) return;
            this.loadingProfile = true;
            try {
                const resp = await fetch(`/user/${encodeURIComponent(ent.user)}`);
                if (!resp.ok) {
                    // user not found or server error
                    this.userProfile = null;
                } else {
                    this.userProfile = await resp.json();
                }
            } catch (e) {
                this.userProfile = null;
            } finally {
                this.loadingProfile = false;
            }
        },
    },
};
