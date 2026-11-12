import { supabaseClient } from './supabase-client.js';

async function listItems() {
    const listPlace = document.getElementById(`testtable`);

    const { data, error } = await supabaseClient
        .from(`testtable`)
        .select(`*`);
    
    if (error) {
        console.error(`supabase errored lol: `, error);
        listPlace.innerHTML = `<li>error oh noooooo: ${error.message}</li>`;
        return;
    }

    listPlace.innerHTML = '';

    data.forEach(item => {
        const li = document.createElement(`li`);
        li.textContent = `${item.testname}, ${item.id}`;
        listPlace.appendChild(li);
    });
}

listItems();
