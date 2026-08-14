import React, { useState } from 'react';
import TaskList from './TaskList';
import TaskInput from './TaskInput';

function App() {
  const [tasks, setTasks] = useState<string[]>([]);

  const addTask = (task: string) => {
    setTasks([...tasks, task]);
  }

  return (
    <div>
      <TaskInput addTask={addTask} />
      <TaskList tasks={tasks} />
    </div>
  );
}

export default App;
